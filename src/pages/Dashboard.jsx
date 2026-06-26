import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CharacterCard from "../components/CharacterCard";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { getNextRaidReset, formatCountdown, isRaidLocked } from "../utils/raidReset";
import { getClassIcon } from "../utils/classIcons";
import { addAccount, addCharacter, updateCharacter, upsertRaidStatus } from "../services/dataService";
import {
  parseNovaActiveInstances,
  parseNovaCharacters,
  parseNovaSavedInstances,
  parseNovaWorldBuffs
} from "../utils/novaInstanceParser";
import { useInventory } from "../hooks/useInventory";
import { computeShoppingNeeds } from "../utils/shoppingList";
import { getCharacterBuffSet, normalizeBuffName } from "../utils/buffCatalog";
import {
  buildConnectedFileEntries,
  loadConnectedHandles,
  readConnectedFileMeta,
  saveConnectedFileMeta,
  saveConnectedHandles
} from "../utils/novaFileConnections";
import { parseDataStoreContainers } from "../utils/dataStoreContainersParser";
import {
  buildConnectedFileEntries as buildBagnonConnectedFileEntries,
  loadConnectedHandles as loadBagnonConnectedHandles,
  readConnectedFileMeta as readBagnonConnectedFileMeta,
  saveConnectedFileMeta as saveBagnonConnectedFileMeta,
  saveConnectedHandles as saveBagnonConnectedHandles
} from "../utils/bagnonFileConnections";
import { replaceInventoryItems } from "../services/dataService";

const NIT_PATHS_KEY = "nit_savedvariables_paths";
const NIT_SELECTED_FILE_INDEXES_KEY = "nit_selected_file_indexes";
const BAGNON_SELECTED_FILE_INDEXES_KEY = "bagnon_selected_file_indexes";
const DASHBOARD_SECTION_STATE_KEY = "dashboard_section_state";
const DASHBOARD_AUTOSYNC_KEY = "dashboard_auto_sync_settings";

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

function getSavedPathAccountHint() {
  const raw = localStorage.getItem(NIT_PATHS_KEY);
  if (!raw) {
    return "";
  }

  let paths = [];
  try {
    const parsed = JSON.parse(raw);
    paths = Array.isArray(parsed) ? parsed : [raw];
  } catch {
    paths = [raw];
  }

  const accounts = Array.from(new Set(paths.map((path) => extractAccountFromPath(path)).filter(Boolean)));
  return accounts.length === 1 ? accounts[0] : "";
}

function getSelectedConnectedFileIndexes() {
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
}

function getSelectedBagnonConnectedFileIndexes() {
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
}

function readDashboardSectionState() {
  const defaults = {
    buffReadiness: true,
    filters: true,
    characters: true
  };

  try {
    const raw = localStorage.getItem(DASHBOARD_SECTION_STATE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return defaults;
    }

    return {
      ...defaults,
      buffReadiness: parsed.buffReadiness !== false,
      filters: parsed.filters !== false,
      characters: parsed.characters !== false
    };
  } catch {
    return defaults;
  }
}

function readDashboardAutoSyncSettings() {
  const defaults = {
    enabled: false,
    minutes: 5
  };

  try {
    const raw = localStorage.getItem(DASHBOARD_AUTOSYNC_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return defaults;
    }

    const parsedMinutes = Number(parsed.minutes);
    const safeMinutes = Number.isFinite(parsedMinutes)
      ? Math.min(60, Math.max(1, Math.round(parsedMinutes)))
      : defaults.minutes;

    return {
      enabled: parsed.enabled === true,
      minutes: safeMinutes
    };
  } catch {
    return defaults;
  }
}

function DashboardPage() {
  const { user, loading: authLoading, hasFirebaseConfig } = useAuth();
  const { data, loading } = useUserCollections(user?.uid);
  const inventoryItems = useInventory(user?.uid);
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [activeRaidNames, setActiveRaidNames] = useState([]);
  const [connectedFiles, setConnectedFiles] = useState([]);
  const [bagnonConnectedFiles, setBagnonConnectedFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [factionFilter, setFactionFilter] = useState("all");
  const [realmFilter, setRealmFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [minLevelFilter, setMinLevelFilter] = useState("");
  const [needFilter, setNeedFilter] = useState("needed");
  const [availabilityFilter, setAvailabilityFilter] = useState("any");
  const [sortBy, setSortBy] = useState("raids");
  const [buffReadinessClassFilter, setBuffReadinessClassFilter] = useState("all");
  const [buffReadinessRowFilter, setBuffReadinessRowFilter] = useState("all");
  const [buffChipVisibility, setBuffChipVisibility] = useState("all");
  const [sectionOpen, setSectionOpen] = useState(() => readDashboardSectionState());
  const [autoSyncSettings, setAutoSyncSettings] = useState(() => readDashboardAutoSyncSettings());
  const [autoSyncFailures, setAutoSyncFailures] = useState(0);
  const [autoSyncWarning, setAutoSyncWarning] = useState("");
  const [nextAutoSyncAt, setNextAutoSyncAt] = useState(null);
  const [cooldownAlerts, setCooldownAlerts] = useState([]);
  const previousLockedRaidsRef = useRef(null);
  const autoSyncInFlightRef = useRef(false);

  const nextReset = getNextRaidReset("Naxxramas");

  const visibleCharacters = useMemo(
    () => data.characters.filter((character) => character.showOnDashboard !== false),
    [data.characters]
  );

  const classOptions = useMemo(
    () => Array.from(new Set(visibleCharacters.map((character) => character.class).filter(Boolean))).sort(),
    [visibleCharacters]
  );
  const factionOptions = useMemo(
    () => Array.from(new Set(visibleCharacters.map((character) => character.faction).filter(Boolean))).sort(),
    [visibleCharacters]
  );
  const realmOptions = useMemo(
    () => Array.from(new Set(visibleCharacters.map((character) => character.realm).filter(Boolean))).sort(),
    [visibleCharacters]
  );
  const accountNameById = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account.battleNetId])),
    [data.accounts]
  );
  const visibleCharacterById = useMemo(
    () => new Map(visibleCharacters.map((character) => [character.id, character])),
    [visibleCharacters]
  );
  const accountOptions = useMemo(() => {
    const map = new Map();

    visibleCharacters.forEach((character) => {
      const value = character.accountId || "unassigned";
      const label = character.accountId
        ? accountNameById.get(character.accountId) || "Unknown account"
        : "Unassigned";

      if (!map.has(value)) {
        map.set(value, label);
      }
    });

    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleCharacters, accountNameById]);

  const buffReadinessRows = useMemo(() => {
    return visibleCharacters
      .map((character) => {
        const matchingProfiles = data.buffProfiles.filter(
          (profile) => profile.className === "All" || profile.className === character.class
        );
        const required = new Set(
          matchingProfiles.flatMap((profile) => Array.isArray(profile.buffs) ? profile.buffs : [])
        );
        const requiredBuffs = [...required].sort((a, b) => a.localeCompare(b));
        const activeBuffs = Array.isArray(character.buffs) ? character.buffs : [];
        const boonedBuffs = Array.isArray(character.storedBuffs) ? character.storedBuffs : [];
        const activeSet = new Set(activeBuffs.map(normalizeBuffName).filter(Boolean));
        const boonedSet = new Set(boonedBuffs.map(normalizeBuffName).filter(Boolean));
        const allBuffs = getCharacterBuffSet(character);
        const missingBuffs = requiredBuffs.filter((buff) => !allBuffs.has(String(buff).trim().toLowerCase()));
        const buffStatuses = requiredBuffs.map((buff) => {
          const key = normalizeBuffName(buff);
          if (activeSet.has(key)) {
            return { name: buff, status: "active" };
          }
          if (boonedSet.has(key)) {
            return { name: buff, status: "booned" };
          }
          return { name: buff, status: "missing" };
        });

        return {
          characterId: character.id,
          characterName: character.name,
          className: character.class,
          requiredBuffs,
          activeBuffs,
          boonedBuffs,
          missingBuffs,
          buffStatuses,
          readyCount: requiredBuffs.length - missingBuffs.length
        };
      })
      .filter((row) => row.requiredBuffs.length)
      .sort((a, b) => a.missingBuffs.length - b.missingBuffs.length || a.characterName.localeCompare(b.characterName));
  }, [visibleCharacters, data.buffProfiles]);

  const buffReadinessClassOptions = useMemo(
    () => Array.from(new Set(buffReadinessRows.map((row) => row.className).filter(Boolean))).sort(),
    [buffReadinessRows]
  );

  const filteredBuffReadinessRows = useMemo(() => {
    return buffReadinessRows.filter((row) => {
      if (buffReadinessClassFilter !== "all" && row.className !== buffReadinessClassFilter) {
        return false;
      }

      if (buffReadinessRowFilter === "missing" && row.missingBuffs.length === 0) {
        return false;
      }

      if (buffReadinessRowFilter === "ready" && row.missingBuffs.length > 0) {
        return false;
      }

      if (buffChipVisibility === "missing" && row.missingBuffs.length === 0) {
        return false;
      }

      return true;
    });
  }, [buffReadinessRows, buffReadinessClassFilter, buffReadinessRowFilter, buffChipVisibility]);

  const hydrateConnectedFiles = useCallback(() => {
    loadConnectedHandles()
      .then((handles) => {
        const selectedIndexes = getSelectedConnectedFileIndexes();
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
    loadBagnonConnectedHandles()
      .then((handles) => {
        const selectedIndexes = getSelectedBagnonConnectedFileIndexes();
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

  const collectLockedRaids = useCallback(() => {
    const now = new Date();
    const locked = new Map();

    data.raidStatuses.forEach((status) => {
      if (!status?.completed || !status?.resetDate) {
        return;
      }

      const character = visibleCharacterById.get(status.characterId);
      if (!character) {
        return;
      }

      const resetTime = new Date(status.resetDate);
      if (!(resetTime > now)) {
        return;
      }

      const key = `${status.characterId}|${status.raidName}`;
      locked.set(key, {
        key,
        characterName: character.name,
        raidName: status.raidName
      });
    });

    return locked;
  }, [data.raidStatuses, visibleCharacterById]);

  useEffect(() => {
    const checkCooldownTransitions = () => {
      const currentlyLocked = collectLockedRaids();

      if (!previousLockedRaidsRef.current) {
        previousLockedRaidsRef.current = currentlyLocked;
        return;
      }

      const justUnlocked = [];
      previousLockedRaidsRef.current.forEach((entry, key) => {
        if (!currentlyLocked.has(key)) {
          justUnlocked.push(entry);
        }
      });

      if (justUnlocked.length) {
        const nowMs = Date.now();
        const alerts = justUnlocked.map((entry, index) => ({
          id: `${entry.key}-${nowMs}-${index}`,
          text: `${entry.characterName} is now unlocked for ${entry.raidName}.`
        }));

        setCooldownAlerts((prev) => [...alerts, ...prev].slice(0, 6));
      }

      previousLockedRaidsRef.current = currentlyLocked;
    };

    checkCooldownTransitions();
    const intervalId = window.setInterval(checkCooldownTransitions, 30000);
    return () => window.clearInterval(intervalId);
  }, [collectLockedRaids]);

  const dismissCooldownAlert = useCallback((id) => {
    setCooldownAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  const toggleSection = useCallback((sectionKey) => {
    setSectionOpen((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  }, []);

  useEffect(() => {
    localStorage.setItem(DASHBOARD_SECTION_STATE_KEY, JSON.stringify(sectionOpen));
  }, [sectionOpen]);

  useEffect(() => {
    localStorage.setItem(DASHBOARD_AUTOSYNC_KEY, JSON.stringify(autoSyncSettings));
  }, [autoSyncSettings]);

  const filteredEntries = useMemo(() => {
    const entries = visibleCharacters.map((character) => {
      const lootItems = data.lootItems.filter((item) => item.characterId === character.id);
      const remainingLootItems = lootItems.filter((item) => !item.obtained);
      const raidStatuses = data.raidStatuses.filter((status) => status.characterId === character.id);

      const availableRaids = RAIDS.filter((raid) => { 
        const status = raidStatuses.find((s) => s.raidName === raid.name);
        return !isRaidLocked(status);
      });

      const lockedRaids = RAIDS.filter((raid) => {
        const status = raidStatuses.find((s) => s.raidName === raid.name);
        return isRaidLocked(status);
      });

      const lockedRaidSummary = lockedRaids.length
        ? lockedRaids.map((raid) => raid.short).join(", ")
        : "None";

      const raidSummary = availableRaids.length
        ? availableRaids.map((raid) => raid.short).join(", ")
        : "No raid needs";

      const raidItemsByRaid = availableRaids
        .map((raid) => {
          const raidItems = remainingLootItems
            .filter((item) => item.raidName === raid.name)
            .map((item) => item.itemName);

          if (!raidItems.length) {
            return null;
          }

          return {
            raidName: raid.name,
            raidShort: raid.short,
            locked: isRaidLocked(raidStatuses.find((status) => status.raidName === raid.name)),
            items: raidItems
          };
        })
        .filter(Boolean);

      const raidNeedsSummary = raidItemsByRaid.length
        ? raidItemsByRaid.map((raidEntry) => raidEntry.raidShort).join(", ")
        : "No raid needs";

      return {
        character,
        remainingLootCount: remainingLootItems.length,
        lockedRaidCount: lockedRaids.length,
        raidSummary: raidNeedsSummary,
        lockedRaidSummary,
        raidItemsByRaid,
        classIcon: getClassIcon(character.class),
        shoppingNeeds: computeShoppingNeeds(
          character,
          data.shoppingProfiles,
          inventoryItems,
          { accountName: accountNameById.get(character.accountId) || "" }
        )
      };
    });

    const sortedEntries = [...entries].sort((a, b) => {
      if (sortBy === "raids") {
        return b.lockedRaidCount - a.lockedRaidCount || a.character.name.localeCompare(b.character.name);
      }
      return a.character.name.localeCompare(b.character.name);
    });

    return sortedEntries.filter((entry) => {
      const needsMatch = needFilter === "all" || entry.remainingLootCount > 0;
      let availabilityMatch = true;
      if (availabilityFilter === "locked") {
        availabilityMatch = entry.lockedRaidCount > 0;
      }
      if (availabilityFilter === "reset-ready") {
        availabilityMatch = entry.raidItemsByRaid.length > 0;
      }
      const classMatch = classFilter === "all" || entry.character.class === classFilter;
      const factionMatch = factionFilter === "all" || entry.character.faction === factionFilter;
      const realmMatch = realmFilter === "all" || entry.character.realm === realmFilter;
      const accountValue = entry.character.accountId || "unassigned";
      const accountMatch = accountFilter === "all" || accountValue === accountFilter;
      const levelThreshold = Number(minLevelFilter);
      const hasLevelThreshold = minLevelFilter !== "" && !Number.isNaN(levelThreshold);
      const levelValue = Number(entry.character.level);
      const levelMatch =
        !hasLevelThreshold || (!Number.isNaN(levelValue) && levelValue > levelThreshold);
      const nameMatch =
        !searchTerm.trim() || normalize(entry.character.name).includes(normalize(searchTerm));

      return (
        needsMatch
        && availabilityMatch
        && classMatch
        && factionMatch
        && realmMatch
        && accountMatch
        && levelMatch
        && nameMatch
      );
    });
  }, [
    visibleCharacters,
    data.lootItems,
    data.raidStatuses,
    data.shoppingProfiles,
    accountNameById,
    inventoryItems,
    needFilter,
    availabilityFilter,
    classFilter,
    factionFilter,
    realmFilter,
    accountFilter,
    minLevelFilter,
    searchTerm,
    sortBy
  ]);

  const syncFromLuaTexts = useCallback(async (luaTexts, { silent = false } = {}) => {
    if (!user) {
      return;
    }

    console.log("[auto-sync] syncFromLuaTexts called with", luaTexts.length, "sources, silent=", silent);
    setIsSyncing(true);
    setSyncStatus("syncing");
    if (!silent) {
      setSyncMessage("Sync in progress...");
    }

    try {
      const accountHintName = getSavedPathAccountHint();
      const accountMap = new Map(data.accounts.map((account) => [normalize(account.battleNetId), account.id]));
      const parsedCharacters = [];
      const parsed = [];
      const activeRaids = [];
      const parsedWorldBuffStates = [];

      for (const source of luaTexts) {
        const sourceAccount = (source.accountHintName || accountHintName || "").trim();
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
            importedFromNova: true
          };
          const created = await addCharacter(user.uid, payload);
          const createdCharacter = { id: created.id, ...payload };
          charactersByKey.set(key, createdCharacter);
          createdCharacters.push(createdCharacter);
        } else {
          const existing = charactersByKey.get(key);
          if (existing) {
            const updates = {};
            if (!existing.accountId && (parsedCharacter.accountId || defaultAccountId)) {
              updates.accountId = parsedCharacter.accountId || defaultAccountId;
              existing.accountId = parsedCharacter.accountId || defaultAccountId;
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

      const stamp = new Date().toLocaleTimeString();
      const currentRaidNames = Array.from(new Set(activeRaids.map((entry) => entry.raidName)));
      setActiveRaidNames(currentRaidNames);
      console.log("[auto-sync] Sync complete, setting lastSyncAt to", stamp);
      setLastSyncAt(new Date());
      setSyncStatus("success");
      if (silent) {
        setSyncMessage(`Auto-sync complete at ${stamp}.`);
      } else {
        const createdCharacterNames = createdCharacters.map((c) => c.name).sort();
        const createdText = createdCharacterNames.length
          ? `Added: ${createdCharacterNames.join(", ")}.`
          : "";

        const lockedCharacters = new Map();
        parsed.forEach((entry) => {
          if (!lockedCharacters.has(entry.characterName)) {
            lockedCharacters.set(entry.characterName, []);
          }
          lockedCharacters.get(entry.characterName).push(entry.raidName);
        });
        const lockedText = lockedCharacters.size
          ? ` Lockouts: ${Array.from(lockedCharacters.entries())
              .map(([name, raids]) => `${name} (${raids.join(", ")})`)
              .join("; ")}.`
          : "";

        const activeCharacters = Array.from(new Set(activeRaids.map((entry) => entry.playerName))).filter(Boolean);
        const raidActivityText = activeCharacters.length
          ? ` In raid: ${activeCharacters.join(", ")} (${currentRaidNames.join(", ")}).`
          : "";

        setSyncMessage(
          `Sync complete. ${createdText}${lockedText}${raidActivityText}`.trim()
        );
      }
    } catch (error) {
      console.error("[auto-sync] Sync error:", error);
      setSyncStatus("error");
      if (!silent) {
        setSyncMessage("Sync failed. Ensure you selected valid NovaInstanceTracker.lua files.");
      }
    } finally {
      setIsSyncing(false);
    }
  }, [data.accounts, data.characters, user]);

  const syncBagnonFromLuaTexts = useCallback(async (luaTexts, { silent = false } = {}) => {
    if (!user) {
      return;
    }

    const parsedItems = [];
    for (const source of luaTexts) {
      parsedItems.push(
        ...parseDataStoreContainers(source.text, source.fileName || "", source.accountHintName || "")
      );
    }

    if (!parsedItems.length) {
      if (!silent) {
        setSyncMessage("No inventory items were found in the selected DataStore_Containers files.");
      }
      return;
    }

    await replaceInventoryItems(user.uid, parsedItems);
  }, [user]);

  const onSyncFromConnectedFiles = useCallback(async (silent = false) => {
    if (!window.indexedDB) {
      setSyncStatus("warn");
      if (!silent) {
        setSyncMessage("Browser does not support connected file sync. Use manual file picker sync.");
      }
      return { ok: false, reason: "no-indexeddb" };
    }

    try {
      const [novaHandles, bagnonHandles] = await Promise.all([
        loadConnectedHandles(),
        loadBagnonConnectedHandles()
      ]);

      const novaSelectedIndexes = getSelectedConnectedFileIndexes();
      const novaMeta = readConnectedFileMeta();
      const novaSelectedHandles = novaSelectedIndexes.length
        ? novaSelectedIndexes.map((index) => novaHandles[index]).filter(Boolean)
        : novaHandles;
      const novaSources = [];
      for (const [index, handle] of novaSelectedHandles.entries()) {
        let permission = "granted";
        if (handle.queryPermission) {
          permission = await handle.queryPermission({ mode: "read" });
        }
        if (permission !== "granted") {
          permission = await handle.requestPermission({ mode: "read" });
        }
        if (permission !== "granted") {
          setSyncStatus("warn");
          if (!silent) {
            setSyncMessage("Reconnect Nova files in Settings to restore file access.");
          }
          return { ok: false, reason: "nova-permission" };
        }

        const file = await handle.getFile();
        novaSources.push({
          text: await file.text(),
          accountHintName: novaSelectedIndexes.length ? novaMeta[novaSelectedIndexes[index]]?.accountName || "" : novaMeta[index]?.accountName || ""
        });
      }

      const bagnonSelectedIndexes = getSelectedBagnonConnectedFileIndexes();
      const bagnonMeta = readBagnonConnectedFileMeta();
      const bagnonSelectedHandles = bagnonSelectedIndexes.length
        ? bagnonSelectedIndexes.map((index) => bagnonHandles[index]).filter(Boolean)
        : bagnonHandles;
      const bagnonSources = [];
      for (const [index, handle] of bagnonSelectedHandles.entries()) {
        let permission = "granted";
        if (handle.queryPermission) {
          permission = await handle.queryPermission({ mode: "read" });
        }
        if (permission !== "granted") {
          permission = await handle.requestPermission({ mode: "read" });
        }
        if (permission !== "granted") {
          setSyncStatus("warn");
          if (!silent) {
            setSyncMessage("Reconnect Bagnon files in Settings to restore file access.");
          }
          return { ok: false, reason: "bagnon-permission" };
        }

        const file = await handle.getFile();
        bagnonSources.push({
          text: await file.text(),
          accountHintName: bagnonSelectedIndexes.length ? bagnonMeta[bagnonSelectedIndexes[index]]?.accountName || "" : bagnonMeta[index]?.accountName || "",
          fileName: file.name
        });
      }

      if (!novaSources.length && !bagnonSources.length) {
        if (!silent) {
          setSyncStatus("warn");
          setSyncMessage("No files selected for sync. Select files in Settings.");
        }
        return { ok: false, reason: "no-sources" };
      }

      if (novaSources.length) {
        await syncFromLuaTexts(novaSources, { silent });
      }

      if (bagnonSources.length) {
        await syncBagnonFromLuaTexts(bagnonSources, { silent });
      }

      if (!silent) {
        setSyncMessage(
          `Sync complete. Processed ${novaSources.length} Nova file(s) and ${bagnonSources.length} Bagnon file(s).`
        );
      }
      setSyncStatus("success");
      setLastSyncAt(new Date());
      setAutoSyncFailures(0);
      setAutoSyncWarning("");
      return { ok: true };
    } catch (error) {
      console.error("[auto-sync] Error:", error);
      setSyncStatus("warn");
      if (!silent) {
        setSyncMessage("Could not read selected connected files. Reconnect files in Settings.");
      }
      return { ok: false, reason: "read-error" };
    }
  }, [syncFromLuaTexts, syncBagnonFromLuaTexts]);

  useEffect(() => {
    if (!autoSyncSettings.enabled || !user) {
      setNextAutoSyncAt(null);
      if (!autoSyncSettings.enabled) {
        setAutoSyncFailures(0);
        setAutoSyncWarning("");
      }
      return;
    }

    const minutes = Math.min(60, Math.max(1, Number(autoSyncSettings.minutes) || 5));
    const intervalMs = minutes * 60 * 1000;
    setNextAutoSyncAt(new Date(Date.now() + intervalMs));

    const timerId = window.setInterval(async () => {
      if (autoSyncInFlightRef.current) {
        return;
      }

      autoSyncInFlightRef.current = true;
      try {
        const result = await onSyncFromConnectedFiles(true);
        if (!result?.ok) {
          setAutoSyncFailures((prev) => {
            const next = prev + 1;
            setAutoSyncWarning(
              `Auto-sync retry warning: ${next} failed attempt${next === 1 ? "" : "s"}. Check connected file permissions in Settings if this continues.`
            );
            return next;
          });
        }
      } finally {
        autoSyncInFlightRef.current = false;
        setNextAutoSyncAt(new Date(Date.now() + intervalMs));
      }
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
      autoSyncInFlightRef.current = false;
    };
  }, [autoSyncSettings.enabled, autoSyncSettings.minutes, onSyncFromConnectedFiles, user]);

  const onReconnectConnectedFile = async (index) => {
    if (!window.showOpenFilePicker) {
      setSyncMessage("Your browser does not support direct file connections. Use Settings to reconnect files.");
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
      setConnectedFiles(
        buildConnectedFileEntries(nextHandles, nextMeta, getSelectedConnectedFileIndexes())
      );
      setSyncMessage(`Reconnected ${handles[0].name || "selected file"}.`);
    } catch {
      setSyncMessage("Could not reconnect the file. Try again.");
    }
  };

  if (!hasFirebaseConfig) {
    return <p className="empty-panel">Add Firebase keys in your .env to enable Auth and data sync.</p>;
  }

  if (authLoading || loading) {
    return <p className="empty-panel">Loading dashboard...</p>;
  }

  if (!user) {
    return <p className="empty-panel">Sign in on Settings to view your raid priority dashboard.</p>;
  }

  const resetFilters = () => {
    setSearchTerm("");
    setClassFilter("all");
    setFactionFilter("all");
    setRealmFilter("all");
    setAccountFilter("all");
    setMinLevelFilter("");
    setNeedFilter("needed");
    setAvailabilityFilter("any");
    setSortBy("raids");
  };

  const syncLabel =
    syncStatus === "syncing"
      ? "Syncing"
      : syncStatus === "success"
        ? "Healthy"
        : syncStatus === "error"
          ? "Error"
          : syncStatus === "warn"
            ? "Attention"
            : "Idle";

  return (
    <section>
      {cooldownAlerts.length ? (
        <div className="cooldown-alert-stack" role="status" aria-live="polite">
          {cooldownAlerts.map((alert) => (
            <div key={alert.id} className="cooldown-alert">
              <span>{alert.text}</span>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => dismissCooldownAlert(alert.id)}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="panel-heading">
        <div>
          <h2>Raid Dashboard</h2>
          <p>Weekly reset in {formatCountdown(nextReset)}</p>
        </div>
        <div className="row-actions">
          <span className={`sync-pill ${syncStatus}`}>
            Sync: {syncLabel} | Last: {lastSyncAt ? lastSyncAt.toLocaleTimeString() : "Never"}
          </span>
          <button type="button" onClick={() => onSyncFromConnectedFiles()} disabled={isSyncing}>
            {isSyncing ? "Syncing..." : "Sync Connected Files"}
          </button>
        </div>
      </div>
      {syncMessage ? <p className="subtitle">{syncMessage}</p> : null}
      <div className="sync-controls" role="group" aria-label="Auto sync controls">
        <label className="saved-toggle">
          <input
            type="checkbox"
            checked={autoSyncSettings.enabled}
            onChange={(event) => setAutoSyncSettings((prev) => ({ ...prev, enabled: event.target.checked }))}
          />
          Auto-sync
        </label>
        <select
          value={String(autoSyncSettings.minutes)}
          onChange={(event) => {
            const minutes = Math.min(60, Math.max(1, Number(event.target.value) || 5));
            setAutoSyncSettings((prev) => ({ ...prev, minutes }));
          }}
          disabled={!autoSyncSettings.enabled}
        >
          <option value="1">Every 1 minute</option>
          <option value="2">Every 2 minutes</option>
          <option value="5">Every 5 minutes</option>
          <option value="10">Every 10 minutes</option>
          <option value="15">Every 15 minutes</option>
          <option value="30">Every 30 minutes</option>
          <option value="60">Every 60 minutes</option>
        </select>
        <span className="subtitle">
          Last successful sync: {lastSyncAt ? lastSyncAt.toLocaleTimeString() : "Never"}
        </span>
        {autoSyncSettings.enabled && nextAutoSyncAt ? (
          <span className="subtitle">Next auto-sync: {nextAutoSyncAt.toLocaleTimeString()}</span>
        ) : null}
        {autoSyncSettings.enabled && autoSyncFailures > 0 ? (
          <span className="subtitle">Retry attempts: {autoSyncFailures}</span>
        ) : null}
      </div>
      {autoSyncWarning ? <p className="sync-warning">{autoSyncWarning}</p> : null}
      {activeRaidNames.length ? (
        <p className="subtitle">Live raid activity detected: {activeRaidNames.join(", ")}.</p>
      ) : null}

      <div className="panel collapsible-section">
        <div className="collapsible-header">
          <div>
            <h3>Buff Readiness</h3>
            <p className="subtitle">Uses Buff Profiles and data synced from NovaWorldBuffs/NIT files.</p>
          </div>
          <button
            type="button"
            className="secondary-btn collapse-toggle"
            onClick={() => toggleSection("buffReadiness")}
            aria-expanded={sectionOpen.buffReadiness}
            aria-controls="dashboard-buff-readiness"
          >
            {sectionOpen.buffReadiness ? "Collapse" : "Expand"}
          </button>
        </div>

        {sectionOpen.buffReadiness ? (
          buffReadinessRows.length ? (
            <>
              <div className="buff-readiness-filters" id="dashboard-buff-readiness">
              <select
                value={buffReadinessClassFilter}
                onChange={(event) => setBuffReadinessClassFilter(event.target.value)}
              >
                <option value="all">All classes</option>
                {buffReadinessClassOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={buffReadinessRowFilter}
                onChange={(event) => setBuffReadinessRowFilter(event.target.value)}
              >
                <option value="all">All readiness</option>
                <option value="missing">Missing buffs</option>
                <option value="ready">Fully ready</option>
              </select>
              <select
                value={buffChipVisibility}
                onChange={(event) => setBuffChipVisibility(event.target.value)}
              >
                <option value="all">Show all chips</option>
                <option value="booned">Show booned</option>
                <option value="missing">Show missing</option>
              </select>
              </div>
              <ul className="simple-list buff-readiness-list">
                {filteredBuffReadinessRows.length ? (
                  filteredBuffReadinessRows.map((row) => {
                    const visibleBuffStatuses =
                      buffChipVisibility === "booned"
                        ? row.buffStatuses.filter((buff) => buff.status === "booned")
                        : buffChipVisibility === "missing"
                          ? row.buffStatuses.filter((buff) => buff.status === "missing")
                          : row.buffStatuses;

                    return (
                      <li key={row.characterId} className="buff-readiness-item">
                        <div>
                          <strong>{row.characterName}</strong> ({row.className}) - {row.readyCount}/{row.requiredBuffs.length} ready
                        </div>
                        {visibleBuffStatuses.length ? (
                          <div className="buff-chip-row">
                            {visibleBuffStatuses.map((buff) => (
                              <span key={`${row.characterId}-${buff.name}`} className={`buff-chip ${buff.status}`}>
                                {buff.name} - {buff.status === "active" ? "Active" : buff.status === "booned" ? "Booned" : "Missing"}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="subtitle">All required buffs are active.</span>
                        )}
                      </li>
                    );
                  })
                ) : (
                  <li>No characters match the selected readiness filters.</li>
                )}
              </ul>
            </>
          ) : (
            <p className="empty-panel" id="dashboard-buff-readiness">Create Buff Profiles to start tracking class buff readiness.</p>
          )
        ) : null}
      </div>

      <div className="panel collapsible-section">
        <div className="collapsible-header">
          <h3>Filters</h3>
          <button
            type="button"
            className="secondary-btn collapse-toggle"
            onClick={() => toggleSection("filters")}
            aria-expanded={sectionOpen.filters}
            aria-controls="dashboard-filters"
          >
            {sectionOpen.filters ? "Collapse" : "Expand"}
          </button>
        </div>

        {sectionOpen.filters ? (
          <div className="dashboard-filters" id="dashboard-filters">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search character name"
            />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="raids">Most raids needed</option>
              <option value="name">Alphabetical</option>
            </select>
            <select value={needFilter} onChange={(event) => setNeedFilter(event.target.value)}>
              <option value="needed">Needs items only</option>
              <option value="all">Show all visible</option>
            </select>
            <select
              value={availabilityFilter}
              onChange={(event) => setAvailabilityFilter(event.target.value)}
            >
              <option value="any">All availability</option>
              <option value="locked">Locked out only</option>
              <option value="reset-ready">Reset-ready only</option>
            </select>
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="all">All classes</option>
              {classOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select value={factionFilter} onChange={(event) => setFactionFilter(event.target.value)}>
              <option value="all">All factions</option>
              {factionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select value={realmFilter} onChange={(event) => setRealmFilter(event.target.value)}>
              <option value="all">All realms</option>
              {realmOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
              <option value="all">All accounts</option>
              {accountOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="1"
              value={minLevelFilter}
              onChange={(event) => setMinLevelFilter(event.target.value)}
              placeholder="Level > X"
            />
            <button type="button" onClick={resetFilters} className="secondary-btn">
              Clear
            </button>
          </div>
        ) : null}
      </div>

      <div className="panel collapsible-section">
        <div className="collapsible-header">
          <h3>Character Results ({filteredEntries.length})</h3>
          <button
            type="button"
            className="secondary-btn collapse-toggle"
            onClick={() => toggleSection("characters")}
            aria-expanded={sectionOpen.characters}
            aria-controls="dashboard-character-results"
          >
            {sectionOpen.characters ? "Collapse" : "Expand"}
          </button>
        </div>

        {sectionOpen.characters ? (
          !filteredEntries.length ? (
            <p className="empty-panel" id="dashboard-character-results">No characters match the current dashboard filters.</p>
          ) : (
            <div className="card-grid" id="dashboard-character-results">
              {filteredEntries.map((entry) => (
                <CharacterCard
                  key={entry.character.id}
                  character={entry.character}
                  remainingLootCount={entry.remainingLootCount}
                  lockedRaidCount={entry.lockedRaidCount}
                  raidSummary={entry.raidSummary}
                  lockedRaidSummary={entry.lockedRaidSummary}
                  raidItemsByRaid={entry.raidItemsByRaid}
                  classIcon={entry.classIcon}
                  shoppingNeeds={entry.shoppingNeeds}
                />
              ))}
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}

export default DashboardPage;
