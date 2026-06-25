import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import {
  addAccount,
  addCharacter,
  clearInventoryData,
  deleteAllUserData,
  replaceInventoryItems,
  updateCharacter,
  upsertRaidStatus
} from "../services/dataService";
import {
  parseNovaActiveInstances,
  parseNovaCharacters,
  parseNovaSavedInstances,
  parseNovaWorldBuffs
} from "../utils/novaInstanceParser";
import {
  buildConnectedFileEntries,
  loadConnectedHandles,
  mergeConnectedHandles,
  readConnectedFileMeta,
  saveConnectedFileMeta,
  saveConnectedHandles
} from "../utils/novaFileConnections";
import { parseDataStoreContainers } from "../utils/dataStoreContainersParser";
import {
  buildConnectedFileEntries as buildBagnonConnectedFileEntries,
  loadConnectedHandles as loadBagnonConnectedHandles,
  mergeConnectedHandles as mergeBagnonConnectedHandles,
  readConnectedFileMeta as readBagnonConnectedFileMeta,
  saveConnectedFileMeta as saveBagnonConnectedFileMeta,
  saveConnectedHandles as saveBagnonConnectedHandles
} from "../utils/bagnonFileConnections";
import { getCharacterFilterOptions, matchesCharacterFilters, resolveRaidTagLabel } from "../utils/characterFilters";

const NIT_PATHS_KEY = "nit_savedvariables_paths";
const NIT_SELECTED_FILE_INDEXES_KEY = "nit_selected_file_indexes";
const BAGNON_PATHS_KEY = "bagnon_savedvariables_paths";
const BAGNON_SELECTED_FILE_INDEXES_KEY = "bagnon_selected_file_indexes";
const NOVA_EXPECTED_FILES = ["NovaInstanceTracker.lua", "NovaWorldBuffs.lua"];
const INVENTORY_EXPECTED_FILES = ["DataStore_Containers.lua"];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function characterKey(name, realm) {
  return `${normalize(name)}|${normalize(realm)}`;
}

function extractAccountFromPath(path) {
  const match = String(path || "").match(/[\\/]Account[\\/]([^\\/]+)[\\/]SavedVariables/i);
  return match?.[1] || "";
}

function getUniqueAccountHint(paths) {
  const accounts = Array.from(
    new Set(paths.map((path) => extractAccountFromPath(path)).filter(Boolean))
  );
  return accounts.length === 1 ? accounts[0] : "";
}

function getFileLabelHint(paths) {
  const labels = Array.from(new Set(paths.map((path) => String(path || "").trim()).filter(Boolean)));
  return labels.length === 1 ? labels[0] : "";
}

function summarizeLinkedFiles(files, expectedFiles) {
  const linkedNames = files
    .map((file) => String(file.fileName || file.name || "").trim().toLowerCase())
    .filter(Boolean);

  const expectedStates = expectedFiles.map((expectedName) => {
    const lowerExpected = expectedName.toLowerCase();
    const linked = linkedNames.some((name) => name === lowerExpected || name.endsWith(`/${lowerExpected}`));
    return { fileName: expectedName, linked };
  });

  const linkedCount = expectedStates.filter((entry) => entry.linked).length;
  return {
    expectedStates,
    linkedCount,
    allLinked: linkedCount === expectedFiles.length
  };
}

function SettingsPage() {
  const { user, hasFirebaseConfig, signInWithGoogle, signOutUser } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const [nitPaths, setNitPaths] = useState([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [bagnonSyncMessage, setBagnonSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBagnonSyncing, setIsBagnonSyncing] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [savingCharacterId, setSavingCharacterId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [realmFilter, setRealmFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [minLevelFilter, setMinLevelFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [activeRaidTagFilter, setActiveRaidTagFilter] = useState("all");
  const [connectedFiles, setConnectedFiles] = useState([]);
  const [pendingConnectHandles, setPendingConnectHandles] = useState([]);
  const [pendingAccountName, setPendingAccountName] = useState("");
  const [bagnonPaths, setBagnonPaths] = useState([]);
  const [bagnonConnectedFiles, setBagnonConnectedFiles] = useState([]);
  const [pendingBagnonConnectHandles, setPendingBagnonConnectHandles] = useState([]);
  const [pendingBagnonAccountName, setPendingBagnonAccountName] = useState("");
  const [isClearingInventory, setIsClearingInventory] = useState(false);
  const [novaValidationMessage, setNovaValidationMessage] = useState("");
  const [inventoryValidationMessage, setInventoryValidationMessage] = useState("");
  const [novaValidationRun, setNovaValidationRun] = useState(false);
  const [inventoryValidationRun, setInventoryValidationRun] = useState(false);
  const accountNameById = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account.battleNetId])),
    [data.accounts]
  );
  const filterOptions = useMemo(
    () => getCharacterFilterOptions(data.characters, accountNameById),
    [data.characters, accountNameById]
  );
  const filteredCharacters = useMemo(
    () => data.characters.filter((character) => matchesCharacterFilters(character, {
      searchTerm,
      classFilter,
      factionFilter: "all",
      realmFilter,
      accountFilter,
      minLevelFilter,
      visibilityFilter,
      activeRaidTagFilter
    }, accountNameById)),
    [
      data.characters,
      searchTerm,
      classFilter,
      realmFilter,
      accountFilter,
      minLevelFilter,
      visibilityFilter,
      activeRaidTagFilter,
      accountNameById
    ]
  );

  const novaLinkedSummary = useMemo(
    () => summarizeLinkedFiles(connectedFiles, NOVA_EXPECTED_FILES),
    [connectedFiles]
  );

  const inventoryLinkedSummary = useMemo(
    () => summarizeLinkedFiles(bagnonConnectedFiles, INVENTORY_EXPECTED_FILES),
    [bagnonConnectedFiles]
  );

  const validateNovaSetup = useCallback(() => {
    const missingFiles = novaLinkedSummary.expectedStates
      .filter((entry) => !entry.linked)
      .map((entry) => entry.fileName);

    setNovaValidationRun(true);
    if (!missingFiles.length) {
      setNovaValidationMessage("Nova setup ready. All expected files are linked.");
      return;
    }

    setNovaValidationMessage(`Nova setup incomplete. Missing: ${missingFiles.join(", ")}.`);
  }, [novaLinkedSummary]);

  const validateInventorySetup = useCallback(() => {
    const missingFiles = inventoryLinkedSummary.expectedStates
      .filter((entry) => !entry.linked)
      .map((entry) => entry.fileName);

    setInventoryValidationRun(true);
    if (!missingFiles.length) {
      setInventoryValidationMessage("Inventory setup ready. All expected files are linked.");
      return;
    }

    setInventoryValidationMessage(`Inventory setup incomplete. Missing: ${missingFiles.join(", ")}.`);
  }, [inventoryLinkedSummary]);

  const readSelectedFileIndexes = () => {
    try {
      const raw = localStorage.getItem(NIT_SELECTED_FILE_INDEXES_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((value) => Number.isInteger(value) && value >= 0) : [];
    } catch {
      return [];
    }
  };

  const saveSelectedFileIndexes = (indexes) => {
    localStorage.setItem(NIT_SELECTED_FILE_INDEXES_KEY, JSON.stringify(indexes));
  };

  const readBagnonSelectedFileIndexes = () => {
    try {
      const raw = localStorage.getItem(BAGNON_SELECTED_FILE_INDEXES_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((value) => Number.isInteger(value) && value >= 0) : [];
    } catch {
      return [];
    }
  };

  const saveBagnonSelectedFileIndexes = (indexes) => {
    localStorage.setItem(BAGNON_SELECTED_FILE_INDEXES_KEY, JSON.stringify(indexes));
  };

  useEffect(() => {
    const savedRaw = localStorage.getItem(NIT_PATHS_KEY);
    if (!savedRaw) {
      return;
    }

    try {
      const parsed = JSON.parse(savedRaw);
      if (Array.isArray(parsed)) {
        setNitPaths(parsed.filter(Boolean));
        return;
      }
    } catch {
      // Backward compatibility with old single-path storage.
    }

    if (savedRaw.trim()) {
      setNitPaths([savedRaw.trim()]);
    }
  }, []);

  useEffect(() => {
    const savedRaw = localStorage.getItem(BAGNON_PATHS_KEY);
    if (!savedRaw) {
      return;
    }

    try {
      const parsed = JSON.parse(savedRaw);
      if (Array.isArray(parsed)) {
        setBagnonPaths(parsed.filter(Boolean));
        return;
      }
    } catch {
      // Backward compatibility with old single-path storage.
    }

    if (savedRaw.trim()) {
      setBagnonPaths([savedRaw.trim()]);
    }
  }, []);

  const hydrateConnectedFiles = useCallback(() => {
    if (!window.indexedDB) {
      return;
    }

    loadConnectedHandles()
      .then((handles) => {
        const selectedIndexes = readSelectedFileIndexes();
        const meta = readConnectedFileMeta();
        setConnectedFiles(buildConnectedFileEntries(handles, meta, selectedIndexes));
      })
      .catch(() => {
        setConnectedFiles([]);
      });
  }, []);

  useEffect(() => {
    hydrateConnectedFiles();
  }, [hydrateConnectedFiles]);

  const hydrateBagnonConnectedFiles = useCallback(() => {
    if (!window.indexedDB) {
      return;
    }

    loadBagnonConnectedHandles()
      .then((handles) => {
        const selectedIndexes = readBagnonSelectedFileIndexes();
        const meta = readBagnonConnectedFileMeta();
        setBagnonConnectedFiles(buildBagnonConnectedFileEntries(handles, meta, selectedIndexes));
      })
      .catch(() => {
        setBagnonConnectedFiles([]);
      });
  }, []);

  useEffect(() => {
    hydrateBagnonConnectedFiles();
  }, [hydrateBagnonConnectedFiles]);

  const savePaths = (paths) => {
    setNitPaths(paths);
    localStorage.setItem(NIT_PATHS_KEY, JSON.stringify(paths));
  };

  const saveBagnonPaths = (paths) => {
    setBagnonPaths(paths);
    localStorage.setItem(BAGNON_PATHS_KEY, JSON.stringify(paths));
  };

  const syncFromLuaTexts = async (sources) => {
    if (!user) {
      return;
    }

    setIsSyncing(true);
    setSyncMessage("Sync in progress...");

    try {
      const accountMap = new Map(data.accounts.map((account) => [normalize(account.battleNetId), account.id]));
      const parsedCharacters = [];
      const parsed = [];
      const activeRaids = [];
      const parsedWorldBuffStates = [];

      for (const source of sources) {
        const sourceAccount = (source.accountHintName || "").trim();
        let sourceAccountId = "";
        if (sourceAccount) {
          const normalized = normalize(sourceAccount);
          sourceAccountId = accountMap.get(normalized) || "";
          if (!sourceAccountId) {
            const created = await addAccount(user.uid, sourceAccount);
            sourceAccountId = created.id;
            accountMap.set(normalized, sourceAccountId);
          }
        }

        const parsedFromSource = parseNovaCharacters(source.text).map((entry) => ({
          ...entry,
          accountId: sourceAccountId
        }));
        parsedCharacters.push(...parsedFromSource);
        const worldBuffStates = parseNovaWorldBuffs(source.text).map((entry) => ({
          ...entry,
          accountId: sourceAccountId
        }));
        parsedWorldBuffStates.push(...worldBuffStates);
        parsedCharacters.push(...worldBuffStates.map((entry) => ({
          name: entry.name,
          realm: entry.realm,
          className: entry.className || "Unknown",
          faction: entry.faction || "Unknown",
          level: typeof entry.level === "number" ? entry.level : null,
          restedXp: null,
          accountId: sourceAccountId
        })));
        parsed.push(...parseNovaSavedInstances(source.text));
        activeRaids.push(...parseNovaActiveInstances(source.text));
      }

      const dedupedParsedCharacters = new Map();
      parsedCharacters.forEach((entry) => {
        const key = characterKey(entry.name, entry.realm);
        if (!dedupedParsedCharacters.has(key)) {
          dedupedParsedCharacters.set(key, entry);
        }
      });

      const charactersByKey = new Map(
        data.characters.map((character) => [characterKey(character.name, character.realm), character])
      );
      const createdCharacters = [];
      const defaultAccountId = data.accounts.length === 1 ? data.accounts[0].id : "";

      for (const parsedCharacter of dedupedParsedCharacters.values()) {
        const key = characterKey(parsedCharacter.name, parsedCharacter.realm);
        if (!charactersByKey.has(key)) {
          const payload = {
            name: parsedCharacter.name,
            class: parsedCharacter.className || "Unknown",
            faction: parsedCharacter.faction || "Unknown",
            realm: parsedCharacter.realm,
            accountId: parsedCharacter.accountId || defaultAccountId,
            level: typeof parsedCharacter.level === "number" ? parsedCharacter.level : null,
            restedXp: typeof parsedCharacter.restedXp === "number" ? parsedCharacter.restedXp : 0,
            avatarUrl: "",
            showOnDashboard: true,
            activeRaidTag: "",
            importedFromNova: true
          };
          const created = await addCharacter(user.uid, payload);
          const createdCharacter = { id: created.id, ...payload };
          charactersByKey.set(key, createdCharacter);
          createdCharacters.push(createdCharacter);
        } else if (defaultAccountId) {
          const existing = charactersByKey.get(key);
          if (existing) {
            const updates = {};
            if (!existing.accountId) {
              updates.accountId = defaultAccountId;
              existing.accountId = defaultAccountId;
            }
            if (
              typeof parsedCharacter.level === "number"
              && existing.level !== parsedCharacter.level
            ) {
              updates.level = parsedCharacter.level;
              existing.level = parsedCharacter.level;
            }
            if (
              typeof parsedCharacter.restedXp === "number"
              && existing.restedXp !== parsedCharacter.restedXp
            ) {
              updates.restedXp = parsedCharacter.restedXp;
              existing.restedXp = parsedCharacter.restedXp;
            }

            if (Object.keys(updates).length) {
              await updateCharacter(existing.id, updates);
            }
          }
        } else {
          const existing = charactersByKey.get(key);
          if (
            existing
            && typeof parsedCharacter.level === "number"
            && existing.level !== parsedCharacter.level
          ) {
            const updates = { level: parsedCharacter.level };
            if (typeof parsedCharacter.restedXp === "number") {
              updates.restedXp = parsedCharacter.restedXp;
              existing.restedXp = parsedCharacter.restedXp;
            }
            await updateCharacter(existing.id, updates);
            existing.level = parsedCharacter.level;
          } else if (
            existing
            && typeof parsedCharacter.restedXp === "number"
            && existing.restedXp !== parsedCharacter.restedXp
          ) {
            await updateCharacter(existing.id, { restedXp: parsedCharacter.restedXp });
            existing.restedXp = parsedCharacter.restedXp;
          }
        }
      }

      const allCharacters = [...data.characters, ...createdCharacters];
      const parsedByCharacter = new Map();

      parsed.forEach((entry) => {
        const key = `${normalize(entry.characterName)}|${normalize(entry.realm)}`;
        if (!parsedByCharacter.has(key)) {
          parsedByCharacter.set(key, []);
        }
        parsedByCharacter.get(key).push(entry);
      });

      const updates = [];

      allCharacters.forEach((character) => {
        const key = `${normalize(character.name)}|${normalize(character.realm)}`;
        if (!parsedByCharacter.has(key)) {
          return;
        }

        const entries = parsedByCharacter.get(key) || [];
        const lockedRaids = new Map(entries.map((item) => [item.raidName, item]));

        RAIDS.forEach((raid) => {
          const locked = lockedRaids.get(raid.name);
          updates.push(
            upsertRaidStatus(user.uid, {
              characterId: character.id,
              raidName: raid.name,
              completed: Boolean(locked),
              lastRunDate: null,
              resetDate: locked ? locked.resetDate : null
            })
          );
        });
      });

      await Promise.all(updates);

      const worldBuffStateByCharacter = new Map();
      parsedWorldBuffStates.forEach((entry) => {
        const key = characterKey(entry.name, entry.realm);
        const existing = worldBuffStateByCharacter.get(key);

        if (!existing) {
          worldBuffStateByCharacter.set(key, {
            buffs: new Set(entry.buffs || []),
            storedBuffs: new Set(entry.storedBuffs || []),
            chronoCount: entry.chronoCount || 0,
            onyCount: entry.onyCount || 0,
            nefCount: entry.nefCount || 0,
            rendCount: entry.rendCount || 0,
            zanCount: entry.zanCount || 0,
            dmfCount: entry.dmfCount || 0
          });
          return;
        }

        (entry.buffs || []).forEach((buff) => existing.buffs.add(buff));
        (entry.storedBuffs || []).forEach((buff) => existing.storedBuffs.add(buff));
        existing.chronoCount = Math.max(existing.chronoCount || 0, entry.chronoCount || 0);
        existing.onyCount = Math.max(existing.onyCount || 0, entry.onyCount || 0);
        existing.nefCount = Math.max(existing.nefCount || 0, entry.nefCount || 0);
        existing.rendCount = Math.max(existing.rendCount || 0, entry.rendCount || 0);
        existing.zanCount = Math.max(existing.zanCount || 0, entry.zanCount || 0);
        existing.dmfCount = Math.max(existing.dmfCount || 0, entry.dmfCount || 0);
      });

      const buffUpdateOps = [];
      allCharacters.forEach((character) => {
        const key = characterKey(character.name, character.realm);
        const buffState = worldBuffStateByCharacter.get(key);
        if (!buffState) {
          return;
        }

        buffUpdateOps.push(
          updateCharacter(character.id, {
            buffs: [...buffState.buffs].sort((a, b) => a.localeCompare(b)),
            storedBuffs: [...buffState.storedBuffs].sort((a, b) => a.localeCompare(b)),
            chronoCount: buffState.chronoCount || 0,
            buffCounts: {
              ony: buffState.onyCount || 0,
              nef: buffState.nefCount || 0,
              rend: buffState.rendCount || 0,
              zan: buffState.zanCount || 0,
              dmf: buffState.dmfCount || 0
            },
            lastBuffSyncAt: new Date().toISOString()
          })
        );
      });

      if (buffUpdateOps.length) {
        await Promise.all(buffUpdateOps);
      }

      const totalMatches = parsed.length;
      const currentRaidNames = Array.from(new Set(activeRaids.map((entry) => entry.raidName)));
      setSyncMessage(
        `Sync complete. Imported ${totalMatches} saved raid entries, ${parsedWorldBuffStates.length} buff snapshots, and added ${createdCharacters.length} new characters.${currentRaidNames.length ? ` Current raid activity: ${currentRaidNames.join(", ")}.` : ""}`
      );
    } catch (error) {
      setSyncMessage("Sync failed. Ensure you selected a valid NovaInstanceTracker.lua file.");
    } finally {
      setIsSyncing(false);
    }
  };

  const onConnectFiles = async () => {
    if (!window.showOpenFilePicker) {
      setSyncMessage("Your browser does not support direct file connections. Use Update and pick files.");
      return;
    }

    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "Lua files",
            accept: {
              "text/plain": [".lua"]
            }
          }
        ]
      });

      if (!handles.length) {
        return;
      }

      setPendingConnectHandles(handles);
      setPendingAccountName(getUniqueAccountHint(nitPaths) || getUniqueAccountHint(connectedFiles.map((item) => item.accountName)));
      setSyncMessage("Set account name for selected files, then confirm.");
    } catch {
      // User cancelled picker.
    }
  };

  const onCancelPendingConnect = () => {
    setPendingConnectHandles([]);
    setPendingAccountName("");
  };

  const onConfirmPendingConnect = async () => {
    if (!pendingConnectHandles.length) {
      return;
    }

    try {
      const accountHintName = pendingAccountName.trim();
      const existingHandles = await loadConnectedHandles();
      const existingMeta = readConnectedFileMeta();

      const merged = await mergeConnectedHandles(existingHandles, pendingConnectHandles);
      const addedCount = merged.length - existingHandles.length;
      const nextMeta = [...existingMeta];
      for (let index = 0; index < addedCount; index += 1) {
        nextMeta.push({ accountName: accountHintName, fileName: pendingConnectHandles[index]?.name || "" });
      }

      await saveConnectedHandles(merged);
      saveConnectedFileMeta(nextMeta);
      setConnectedFiles(buildConnectedFileEntries(merged, nextMeta));
      saveSelectedFileIndexes(merged.map((_, index) => index));
      if (accountHintName) {
        savePaths([accountHintName]);
      }
      setSyncMessage(
        `Added ${pendingConnectHandles.length} file selection(s). ${merged.length} Nova file(s) now connected.`
      );
      setPendingConnectHandles([]);
      setPendingAccountName("");
    } catch {
      setSyncMessage("Could not connect selected files. Try again.");
    }
  };

  const syncBagnonFromLuaTexts = async (sources) => {
    if (!user) {
      return;
    }

    setIsBagnonSyncing(true);
    setBagnonSyncMessage("Sync in progress...");

    try {
      const parsedItems = [];

      for (const source of sources) {
        parsedItems.push(
          ...parseDataStoreContainers(source.text, source.fileName || "", source.accountHintName || "")
        );
      }

      await replaceInventoryItems(user.uid, parsedItems);
      const uniqueItems = new Set(parsedItems.map((item) => `${item.itemId || ""}|${normalize(item.itemName)}`));
      setBagnonSyncMessage(
        `Sync complete. Imported ${parsedItems.length} item stacks across ${uniqueItems.size} unique item(s).`
      );
    } catch (error) {
      setBagnonSyncMessage("Sync failed. Ensure you selected valid DataStore_Containers.lua files.");
    } finally {
      setIsBagnonSyncing(false);
    }
  };

  const loadSelectedNovaSources = async () => {
    const handles = await loadConnectedHandles();
    const selectedIndexes = readSelectedFileIndexes();
    const meta = readConnectedFileMeta();
    const selectedHandles = selectedIndexes.length
      ? selectedIndexes.map((index) => handles[index]).filter(Boolean)
      : handles;

    const sources = [];
    for (const [index, handle] of selectedHandles.entries()) {
      let permission = "granted";
      if (handle.queryPermission) {
        permission = await handle.queryPermission({ mode: "read" });
      }
      if (permission !== "granted") {
        permission = await handle.requestPermission({ mode: "read" });
      }
      if (permission !== "granted") {
        throw new Error("permission-denied");
      }

      const file = await handle.getFile();
      sources.push({
        text: await file.text(),
        accountHintName: selectedIndexes.length ? meta[selectedIndexes[index]]?.accountName || "" : meta[index]?.accountName || ""
      });
    }

    return sources;
  };

  const loadSelectedBagnonSources = async () => {
    const handles = await loadBagnonConnectedHandles();
    const selectedIndexes = readBagnonSelectedFileIndexes();
    const meta = readBagnonConnectedFileMeta();
    const selectedHandles = selectedIndexes.length
      ? selectedIndexes.map((index) => handles[index]).filter(Boolean)
      : handles;

    const sources = [];
    for (const [index, handle] of selectedHandles.entries()) {
      let permission = "granted";
      if (handle.queryPermission) {
        permission = await handle.queryPermission({ mode: "read" });
      }
      if (permission !== "granted") {
        permission = await handle.requestPermission({ mode: "read" });
      }
      if (permission !== "granted") {
        throw new Error("permission-denied");
      }

      const file = await handle.getFile();
      sources.push({
        text: await file.text(),
        accountHintName: selectedIndexes.length ? meta[selectedIndexes[index]]?.accountName || "" : meta[index]?.accountName || "",
        fileName: file.name
      });
    }

    return sources;
  };

  const onConnectBagnonFiles = async () => {
    if (!window.showOpenFilePicker) {
      setBagnonSyncMessage("Your browser does not support direct file connections. Use Update and pick files.");
      return;
    }

    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: "Lua files",
            accept: {
              "text/plain": [".lua"]
            }
          }
        ]
      });

      if (!handles.length) {
        return;
      }

      setPendingBagnonConnectHandles(handles);
      setPendingBagnonAccountName("");
      setBagnonSyncMessage("Select an account for the new files, then confirm.");
    } catch {
      // User cancelled picker.
    }
  };

  const onCancelPendingBagnonConnect = () => {
    setPendingBagnonConnectHandles([]);
    setPendingBagnonAccountName("");
  };

  const onConfirmPendingBagnonConnect = async () => {
    if (!pendingBagnonConnectHandles.length) {
      return;
    }

    try {
      const accountHintName = pendingBagnonAccountName.trim();
      const existingHandles = await loadBagnonConnectedHandles();
      const existingMeta = readBagnonConnectedFileMeta();

      const merged = await mergeBagnonConnectedHandles(existingHandles, pendingBagnonConnectHandles);
      const addedCount = merged.length - existingHandles.length;
      const nextMeta = [...existingMeta];
      for (let index = 0; index < addedCount; index += 1) {
        nextMeta.push({ accountName: accountHintName, fileName: pendingBagnonConnectHandles[index]?.name || "" });
      }

      await saveBagnonConnectedHandles(merged);
      saveBagnonConnectedFileMeta(nextMeta);
      setBagnonConnectedFiles(buildBagnonConnectedFileEntries(merged, nextMeta));
      saveBagnonSelectedFileIndexes(merged.map((_, index) => index));
      if (accountHintName) {
        saveBagnonPaths([accountHintName]);
      }
      setBagnonSyncMessage(
        `Added ${pendingBagnonConnectHandles.length} file selection(s). ${merged.length} inventory file(s) now connected.`
      );
      setPendingBagnonConnectHandles([]);
      setPendingBagnonAccountName("");
    } catch {
      setBagnonSyncMessage("Could not connect selected files. Try again.");
    }
  };

  const onReconnectBagnonConnectedFile = async (index) => {
    if (!window.showOpenFilePicker) {
      setBagnonSyncMessage("Your browser does not support direct file connections. Use Connect Inventory Files and pick files.");
      return;
    }

    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Lua files",
            accept: {
              "text/plain": [".lua"]
            }
          }
        ]
      });

      if (!handles.length) {
        return;
      }

      const nextHandles = await loadBagnonConnectedHandles();
      nextHandles[index] = handles[0];
      const nextMeta = readBagnonConnectedFileMeta();
      nextMeta[index] = {
        accountName: bagnonConnectedFiles[index]?.accountName || nextMeta[index]?.accountName || "",
        fileName: handles[0].name || ""
      };

      await saveBagnonConnectedHandles(nextHandles);
      saveBagnonConnectedFileMeta(nextMeta);
      setBagnonConnectedFiles(buildBagnonConnectedFileEntries(nextHandles, nextMeta, readBagnonSelectedFileIndexes()));
      setBagnonSyncMessage(`Reconnected ${handles[0].name || "selected file"}.`);
    } catch {
      setBagnonSyncMessage("Could not reconnect the file. Try again.");
    }
  };

  const onUpdateFromBagnonConnectedFiles = async (silent = false) => {
    try {
      await onUpdateFromConnectedFiles(silent);
    } catch {
      if (!silent) {
        setBagnonSyncMessage("Could not read selected connected files. Reconnect files and try again.");
      }
    }
  };

  const onToggleBagnonConnectedFile = (id, checked) => {
    setBagnonConnectedFiles((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, selected: checked } : item));
      const selectedIndexes = next
        .map((item, index) => (item.selected ? index : -1))
        .filter((value) => value >= 0);
      saveBagnonSelectedFileIndexes(selectedIndexes);
      return next;
    });
  };

  const onClearBagnonInventory = async () => {
    if (!window.confirm("Clear synced inventory data for your account? You can re-sync at any time.")) {
      return;
    }

    setIsClearingInventory(true);
    try {
      await clearInventoryData(user.uid);
      setBagnonSyncMessage("Inventory data cleared.");
    } catch {
      setBagnonSyncMessage("Could not clear inventory data. Try again.");
    } finally {
      setIsClearingInventory(false);
    }
  };

  const onRemoveBagnonConnectedFile = async (id) => {
    const next = bagnonConnectedFiles.filter((item) => item.id !== id);
    setBagnonConnectedFiles(next);
    await saveBagnonConnectedHandles(next.map((item) => item.handle));
    saveBagnonConnectedFileMeta(
      next.map((item) => ({ accountName: item.accountName || "", fileName: item.fileName || item.name || "" }))
    );
    const selectedIndexes = next
      .map((item, index) => (item.selected ? index : -1))
      .filter((value) => value >= 0);
    saveBagnonSelectedFileIndexes(selectedIndexes);
    setBagnonSyncMessage(`Connected file removed. ${next.length} remaining.`);
  };

  const onReconnectConnectedFile = async (index) => {
    if (!window.showOpenFilePicker) {
      setSyncMessage("Your browser does not support direct file connections. Use Connect Nova and pick files.");
      return;
    }

    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Lua files",
            accept: {
              "text/plain": [".lua"]
            }
          }
        ]
      });

      if (!handles.length) {
        return;
      }

      const nextHandles = await loadConnectedHandles();
      nextHandles[index] = handles[0];
      const nextMeta = readConnectedFileMeta();
      nextMeta[index] = {
        accountName: connectedFiles[index]?.accountName || nextMeta[index]?.accountName || "",
        fileName: handles[0].name || ""
      };

      await saveConnectedHandles(nextHandles);
      saveConnectedFileMeta(nextMeta);
      setConnectedFiles(buildConnectedFileEntries(nextHandles, nextMeta, readSelectedFileIndexes()));
      setSyncMessage(`Reconnected ${handles[0].name || "selected file"}.`);
    } catch {
      setSyncMessage("Could not reconnect the file. Try again.");
    }
  };

  const onUpdateFromConnectedFiles = async (silent = false) => {
    try {
      const [novaSources, bagnonSources] = await Promise.all([
        loadSelectedNovaSources(),
        loadSelectedBagnonSources()
      ]);

      if (!novaSources.length && !bagnonSources.length) {
        if (!silent) {
          setSyncMessage("Select at least one connected file to sync.");
        }
        return;
      }

      if (novaSources.length) {
        await syncFromLuaTexts(novaSources);
      }

      if (bagnonSources.length) {
        await syncBagnonFromLuaTexts(bagnonSources);
      }
    } catch {
      if (!silent) {
        setSyncMessage("Could not read selected connected files. Reconnect files and try again.");
      }
    }
  };

  const onToggleConnectedFile = (id, checked) => {
    setConnectedFiles((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, selected: checked } : item));
      const selectedIndexes = next
        .map((item, index) => (item.selected ? index : -1))
        .filter((value) => value >= 0);
      saveSelectedFileIndexes(selectedIndexes);
      return next;
    });
  };

  const onRemoveConnectedFile = async (id) => {
    const next = connectedFiles.filter((item) => item.id !== id);
    setConnectedFiles(next);
    await saveConnectedHandles(next.map((item) => item.handle));
    saveConnectedFileMeta(
      next.map((item) => ({ accountName: item.accountName || "", fileName: item.fileName || item.name || "" }))
    );
    const selectedIndexes = next
      .map((item, index) => (item.selected ? index : -1))
      .filter((value) => value >= 0);
    saveSelectedFileIndexes(selectedIndexes);
    setSyncMessage(`Connected file removed. ${next.length} remaining.`);
  };

  const onToggleDashboardVisibility = async (characterId, checked) => {
    setSavingCharacterId(characterId);
    try {
      await updateCharacter(characterId, { showOnDashboard: checked });
    } finally {
      setSavingCharacterId("");
    }
  };

  const onChangeActiveRaidTag = async (characterId, activeRaidTag) => {
    setSavingCharacterId(characterId);
    try {
      await updateCharacter(characterId, { activeRaidTag });
    } finally {
      setSavingCharacterId("");
    }
  };

  const onDeleteAllData = async () => {
    if (!user || isDeletingAll) {
      return;
    }

    const confirmed = window.confirm(
      "Delete ALL your app data (accounts, characters, loot, and raid lockouts)? This cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingAll(true);
    setSyncMessage("Deleting all data...");
    try {
      await deleteAllUserData(user.uid);
      await clearInventoryData(user.uid);
      localStorage.removeItem(NIT_PATHS_KEY);
      localStorage.removeItem(BAGNON_PATHS_KEY);
      await saveConnectedHandles([]);
      await saveBagnonConnectedHandles([]);
      setNitPaths([]);
      setBagnonPaths([]);
      setConnectedFiles([]);
      setBagnonConnectedFiles([]);
      saveSelectedFileIndexes([]);
      saveBagnonSelectedFileIndexes([]);
      setSyncMessage("All data deleted.");
    } catch {
      setSyncMessage("Delete failed. Please try again.");
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <section className="panel">
      <h2>Settings</h2>
      <p>Google login keeps each player's data isolated by Firebase user ID.</p>

      {!hasFirebaseConfig ? (
        <p className="empty-panel">Firebase env vars are missing. Copy .env.example into .env.local.</p>
      ) : user ? (
        <div className="stack-form">
          <p>
            Signed in as <strong>{user.email}</strong>
          </p>

          <div className="panel import-guide-panel">
            <h3>Import Setup Guide</h3>
            <p className="subtitle">Link files once per browser, then sync whenever your SavedVariables change.</p>
            <div className="import-guide-grid">
              <article className="import-guide-card">
                <h4>Raid + Buff Import (Nova)</h4>
                <p className="subtitle">Expected files from SavedVariables:</p>
                <ul className="import-file-checklist">
                  {novaLinkedSummary.expectedStates.map((entry) => (
                    <li
                      key={entry.fileName}
                      className={`import-file-item ${entry.linked ? "linked" : "missing"}${novaValidationRun && !entry.linked ? " needs-attention" : ""}`}
                    >
                      <span>{entry.fileName}</span>
                      <span className={`import-status-chip ${entry.linked ? "ready" : "missing"}`}>
                        {entry.linked ? "Linked" : "Missing"}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="row-actions import-guide-actions">
                  <button type="button" className="secondary-btn" onClick={validateNovaSetup}>
                    Check Nova Setup
                  </button>
                  {novaValidationMessage ? <span className="subtitle">{novaValidationMessage}</span> : null}
                </div>
                <p className="subtitle">
                  Updates: characters, raid lockouts, active raids, world buffs, booned buffs.
                </p>
                <p className="subtitle">
                  Status: {novaLinkedSummary.linkedCount}/{NOVA_EXPECTED_FILES.length} expected file(s) linked.
                </p>
              </article>

              <article className="import-guide-card">
                <h4>Inventory Import (DataStore)</h4>
                <p className="subtitle">Expected files from SavedVariables:</p>
                <ul className="import-file-checklist">
                  {inventoryLinkedSummary.expectedStates.map((entry) => (
                    <li
                      key={entry.fileName}
                      className={`import-file-item ${entry.linked ? "linked" : "missing"}${inventoryValidationRun && !entry.linked ? " needs-attention" : ""}`}
                    >
                      <span>{entry.fileName}</span>
                      <span className={`import-status-chip ${entry.linked ? "ready" : "missing"}`}>
                        {entry.linked ? "Linked" : "Missing"}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="row-actions import-guide-actions">
                  <button type="button" className="secondary-btn" onClick={validateInventorySetup}>
                    Check Inventory Setup
                  </button>
                  {inventoryValidationMessage ? <span className="subtitle">{inventoryValidationMessage}</span> : null}
                </div>
                <p className="subtitle">
                  Updates: bag and bank inventory index used by Shopping and Dashboard totals.
                </p>
                <p className="subtitle">
                  Status: {inventoryLinkedSummary.linkedCount}/{INVENTORY_EXPECTED_FILES.length} expected file(s) linked.
                </p>
              </article>
            </div>
          </div>

          <div className="panel sync-panel">
            <h3>NovaInstanceTracker Sync</h3>
            <p>
              Link expected Nova files first, then use Sync Connected Files to refresh raid and buff data.
            </p>
            {!novaLinkedSummary.allLinked ? (
              <p className="sync-warning">Missing expected Nova file links. Check the setup guide above before syncing.</p>
            ) : null}
            <div className="row-actions">
              <button type="button" onClick={onConnectFiles} disabled={isSyncing}>
                Connect Nova
              </button>
              <button type="button" onClick={onUpdateFromConnectedFiles} disabled={isSyncing}>
                {isSyncing ? "Syncing..." : "Sync Connected Files"}
              </button>
            </div>
            <h4>Connected Files</h4>
            <ul className="simple-list">
              {connectedFiles.length ? (
                connectedFiles.map((item) => (
                  <li key={item.id}>
                    <label className="saved-toggle">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => onToggleConnectedFile(item.id, event.target.checked)}
                      />
                      {item.name}{item.accountName ? ` (${item.accountName})` : ""}
                    </label>
                    <div className="row-actions">
                      <button type="button" className="secondary-btn" onClick={() => onReconnectConnectedFile(connectedFiles.findIndex((entry) => entry.id === item.id))}>
                        Reconnect
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => onRemoveConnectedFile(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))
              ) : (
                <li>No connected files yet. Click Connect Nova once.</li>
              )}
            </ul>
            {syncMessage ? <p>{syncMessage}</p> : null}

            {pendingConnectHandles.length ? (
              <div className="panel">
                <h4>Set Account For New Files</h4>
                <p className="subtitle">
                  {pendingConnectHandles.length} selected file(s) awaiting confirmation.
                </p>
                <select
                  value={pendingAccountName}
                  onChange={(event) => setPendingAccountName(event.target.value)}
                >
                  <option value="">No account</option>
                  {data.accounts.map((account) => (
                    <option key={account.id} value={account.battleNetId}>
                      {account.battleNetId}
                    </option>
                  ))}
                </select>
                <div className="row-actions">
                  <button type="button" onClick={onConfirmPendingConnect}>
                    Confirm Connection
                  </button>
                  <button type="button" className="secondary-btn" onClick={onCancelPendingConnect}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel sync-panel">
            <h3>Inventory Sync (DataStore)</h3>
            <p>
              Link DataStore_Containers files first, then use Sync Connected Files to refresh bag and bank data.
            </p>
            {!inventoryLinkedSummary.allLinked ? (
              <p className="sync-warning">Missing expected inventory file links. Check the setup guide above before syncing.</p>
            ) : null}
            <div className="row-actions">
              <button type="button" onClick={onConnectBagnonFiles} disabled={isBagnonSyncing}>
                Connect Inventory Files
              </button>
              <button type="button" onClick={onUpdateFromBagnonConnectedFiles} disabled={isBagnonSyncing}>
                {isBagnonSyncing ? "Syncing..." : "Sync Connected Files"}
              </button>
              <button type="button" className="danger" onClick={onClearBagnonInventory} disabled={isClearingInventory || isBagnonSyncing}>
                {isClearingInventory ? "Clearing..." : "Clear Inventory Data"}
              </button>
            </div>
            <h4>Connected Files</h4>
            <ul className="simple-list">
              {bagnonConnectedFiles.length ? (
                bagnonConnectedFiles.map((item) => (
                  <li key={item.id}>
                    <label className="saved-toggle">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => onToggleBagnonConnectedFile(item.id, event.target.checked)}
                      />
                      {item.name}{item.accountName ? ` (${item.accountName})` : ""}
                    </label>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => onReconnectBagnonConnectedFile(bagnonConnectedFiles.findIndex((entry) => entry.id === item.id))}
                      >
                        Reconnect
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => onRemoveBagnonConnectedFile(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))
              ) : (
                <li>No connected files yet. Click Connect Inventory Files once.</li>
              )}
            </ul>
            {bagnonSyncMessage ? <p>{bagnonSyncMessage}</p> : null}

            {pendingBagnonConnectHandles.length ? (
              <div className="panel">
                <h4>Set Account For New Files</h4>
                <p className="subtitle">
                  {pendingBagnonConnectHandles.length} selected file(s) awaiting confirmation.
                </p>
                <select
                  value={pendingBagnonAccountName}
                  onChange={(event) => setPendingBagnonAccountName(event.target.value)}
                >
                  <option value="">No account</option>
                  {data.accounts.map((account) => (
                    <option key={account.id} value={account.battleNetId}>
                      {account.battleNetId}
                    </option>
                  ))}
                </select>
                <div className="row-actions">
                  <button type="button" onClick={onConfirmPendingBagnonConnect}>
                    Confirm Connection
                  </button>
                  <button type="button" className="secondary-btn" onClick={onCancelPendingBagnonConnect}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel">
            <h3>Character Tags & Visibility</h3>
            <p>Tag active raiders and control who appears on dashboard and inventory views.</p>
            <div className="dashboard-filters settings-character-filters">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name, realm, account, or raid tag"
              />
              <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                <option value="all">All classes</option>
                {filterOptions.classOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select value={realmFilter} onChange={(event) => setRealmFilter(event.target.value)}>
                <option value="all">All realms</option>
                {filterOptions.realmOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                <option value="all">All accounts</option>
                {filterOptions.accountOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)}>
                <option value="all">All visibility</option>
                <option value="visible">Shown on dashboard</option>
                <option value="hidden">Hidden from dashboard</option>
              </select>
              <select value={activeRaidTagFilter} onChange={(event) => setActiveRaidTagFilter(event.target.value)}>
                <option value="all">All raid tags</option>
                <option value="tagged">Tagged only</option>
                <option value="untagged">Untagged only</option>
                {filterOptions.activeRaidTagOptions.map((option) => (
                  <option key={option} value={option}>
                    {resolveRaidTagLabel(option, RAIDS)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="1"
                value={minLevelFilter}
                onChange={(event) => setMinLevelFilter(event.target.value)}
                placeholder="Min level"
              />
            </div>
            {filteredCharacters.length ? (
              <ul className="simple-list">
                {filteredCharacters.map((character) => (
                  <li key={character.id}>
                    <span>
                      {character.name} - {character.realm} - {character.accountId
                        ? accountNameById.get(character.accountId) || "Unknown account"
                        : "Unassigned"} - L{character.level ?? "?"}
                      {character.activeRaidTag ? ` - ${resolveRaidTagLabel(character.activeRaidTag, RAIDS)}` : ""}
                    </span>
                    <div className="row-actions character-management-actions">
                      <select
                        value={character.activeRaidTag || ""}
                        disabled={savingCharacterId === character.id}
                        onChange={(event) => onChangeActiveRaidTag(character.id, event.target.value)}
                      >
                        <option value="">No raid tag</option>
                        {RAIDS.map((raid) => (
                          <option key={raid.name} value={raid.name}>
                            {raid.short} - {raid.name}
                          </option>
                        ))}
                      </select>
                      <label className="saved-toggle">
                        <input
                          type="checkbox"
                          checked={character.showOnDashboard !== false}
                          disabled={savingCharacterId === character.id}
                          onChange={(event) =>
                            onToggleDashboardVisibility(character.id, event.target.checked)
                          }
                        />
                        Show
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-panel">No characters match these settings filters.</p>
            )}
          </div>

          <button type="button" onClick={signOutUser}>
            Sign Out
          </button>
          <button
            type="button"
            className="danger"
            onClick={onDeleteAllData}
            disabled={isDeletingAll}
          >
            {isDeletingAll ? "Deleting..." : "Delete All Data"}
          </button>
        </div>
      ) : (
        <div className="stack-form">
          <p>Sign in with Google to sync your characters and loot across devices.</p>
          <button type="button" onClick={signInWithGoogle}>
            Sign In with Google
          </button>
        </div>
      )}
    </section>
  );
}

export default SettingsPage;
