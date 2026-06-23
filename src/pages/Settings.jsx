import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import {
  addAccount,
  addCharacter,
  deleteAllUserData,
  replaceInventoryItems,
  updateCharacter,
  upsertRaidStatus
} from "../services/dataService";
import { parseNovaActiveInstances, parseNovaCharacters, parseNovaSavedInstances } from "../utils/novaInstanceParser";
import {
  buildConnectedFileEntries,
  loadConnectedHandles,
  mergeConnectedHandles,
  readConnectedFileMeta,
  saveConnectedFileMeta,
  saveConnectedHandles
} from "../utils/novaFileConnections";
import { parseBagnonInventory, summarizeBagnonInventory } from "../utils/bagnonInventoryParser";
import { parseDataStoreContainers } from "../utils/dataStoreContainersParser";
import {
  buildConnectedFileEntries as buildBagnonConnectedFileEntries,
  loadConnectedHandles as loadBagnonConnectedHandles,
  mergeConnectedHandles as mergeBagnonConnectedHandles,
  readConnectedFileMeta as readBagnonConnectedFileMeta,
  saveConnectedFileMeta as saveBagnonConnectedFileMeta,
  saveConnectedHandles as saveBagnonConnectedHandles
} from "../utils/bagnonFileConnections";

const NIT_PATHS_KEY = "nit_savedvariables_paths";
const NIT_SELECTED_FILE_INDEXES_KEY = "nit_selected_file_indexes";
const BAGNON_PATHS_KEY = "bagnon_savedvariables_paths";
const BAGNON_SELECTED_FILE_INDEXES_KEY = "bagnon_selected_file_indexes";

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

function SettingsPage() {
  const { user, hasFirebaseConfig, signInWithGoogle, signOutUser } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const [nitPaths, setNitPaths] = useState([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [bagnonSyncMessage, setBagnonSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBagnonSyncing, setIsBagnonSyncing] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showOnlyLevel60, setShowOnlyLevel60] = useState(false);
  const [savingVisibilityId, setSavingVisibilityId] = useState("");
  const [connectedFiles, setConnectedFiles] = useState([]);
  const [pendingConnectHandles, setPendingConnectHandles] = useState([]);
  const [pendingAccountName, setPendingAccountName] = useState("");
  const [bagnonPaths, setBagnonPaths] = useState([]);
  const [bagnonConnectedFiles, setBagnonConnectedFiles] = useState([]);
  const [pendingBagnonConnectHandles, setPendingBagnonConnectHandles] = useState([]);
  const [pendingBagnonAccountName, setPendingBagnonAccountName] = useState("");
  const accountNameById = new Map(data.accounts.map((account) => [account.id, account.battleNetId]));

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

      const totalMatches = parsed.length;
      const currentRaidNames = Array.from(new Set(activeRaids.map((entry) => entry.raidName)));
      setSyncMessage(
        `Sync complete. Imported ${totalMatches} saved raid entries and added ${createdCharacters.length} new characters.${currentRaidNames.length ? ` Current raid activity: ${currentRaidNames.join(", ")}.` : ""}`
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
        if (String(source.text || "").includes("DataStore_ContainersDB")) {
          parsedItems.push(...parseDataStoreContainers(source.text, source.fileName || ""));
        } else {
          parsedItems.push(...parseBagnonInventory(source.text, source.fileName, source.accountHintName));
        }
      }

      await replaceInventoryItems(user.uid, parsedItems);

      const grouped = summarizeBagnonInventory(parsedItems, data.characters, data.accounts);
      setBagnonSyncMessage(
        `Sync complete. Imported ${parsedItems.length} item stacks across ${grouped.length} unique item(s).`
      );
    } catch (error) {
      setBagnonSyncMessage("Sync failed. Ensure you selected valid Bagnon SavedVariables files.");
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
        `Added ${pendingBagnonConnectHandles.length} file selection(s). ${merged.length} Bagnon file(s) now connected.`
      );
      setPendingBagnonConnectHandles([]);
      setPendingBagnonAccountName("");
    } catch {
      setBagnonSyncMessage("Could not connect selected files. Try again.");
    }
  };

  const onReconnectBagnonConnectedFile = async (index) => {
    if (!window.showOpenFilePicker) {
      setBagnonSyncMessage("Your browser does not support direct file connections. Use Connect Bagnon and pick files.");
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
    setSavingVisibilityId(characterId);
    try {
      await updateCharacter(characterId, { showOnDashboard: checked });
    } finally {
      setSavingVisibilityId("");
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

          <div className="panel sync-panel">
            <h3>NovaInstanceTracker Sync</h3>
            <p>
              Connect Nova files once, then use Sync Selected whenever you want to refresh the site.
            </p>
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
            <h3>Bagnon Inventory Sync</h3>
            <p>
              Connect Bagnon files once, then use Sync Selected to refresh your bag and bank inventory index.
            </p>
            <div className="row-actions">
              <button type="button" onClick={onConnectBagnonFiles} disabled={isBagnonSyncing}>
                Connect Bagnon
              </button>
              <button type="button" onClick={onUpdateFromBagnonConnectedFiles} disabled={isBagnonSyncing}>
                {isBagnonSyncing ? "Syncing..." : "Sync Connected Files"}
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
                <li>No connected files yet. Click Connect Bagnon once.</li>
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
            <h3>Dashboard Visibility</h3>
            <p>Choose which characters appear on the dashboard.</p>
            <label className="saved-toggle">
              <input
                type="checkbox"
                checked={showOnlyLevel60}
                onChange={(event) => setShowOnlyLevel60(event.target.checked)}
              />
              Show only level 60
            </label>
            <ul className="simple-list">
              {data.characters
                .filter((character) => !showOnlyLevel60 || Number(character.level) === 60)
                .map((character) => (
                <li key={character.id}>
                  <span>
                    {character.name} - {character.realm} - {character.accountId
                      ? accountNameById.get(character.accountId) || "Unknown account"
                      : "Unassigned"} - L{character.level ?? "?"}
                  </span>
                  <label className="saved-toggle">
                    <input
                      type="checkbox"
                      checked={character.showOnDashboard !== false}
                      disabled={savingVisibilityId === character.id}
                      onChange={(event) =>
                        onToggleDashboardVisibility(character.id, event.target.checked)
                      }
                    />
                    Show
                  </label>
                </li>
              ))}
            </ul>
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
