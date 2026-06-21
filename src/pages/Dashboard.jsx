import { useCallback, useEffect, useMemo, useState } from "react";
import CharacterCard from "../components/CharacterCard";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { getNextRaidReset, formatCountdown, isRaidLocked } from "../utils/raidReset";
import { calculateUrgency, sortCharactersByUrgency } from "../utils/urgency";
import { getClassIcon } from "../utils/classIcons";
import { addAccount, addCharacter, upsertRaidStatus } from "../services/dataService";
import { parseNovaCharacters, parseNovaSavedInstances } from "../utils/novaInstanceParser";

const NIT_PATHS_KEY = "nit_savedvariables_paths";
const NIT_HANDLE_DB = "wowloot-nit-handles";
const NIT_HANDLE_STORE = "handles";
const NIT_HANDLE_KEY = "nova-files";
const NIT_SELECTED_FILE_INDEXES_KEY = "nit_selected_file_indexes";
const NIT_AUTO_SYNC_ENABLED_KEY = "nit_auto_sync_enabled";
const NIT_CONNECTED_FILE_META_KEY = "nit_connected_file_meta";

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

function isAutoSyncEnabled() {
  const raw = localStorage.getItem(NIT_AUTO_SYNC_ENABLED_KEY);
  return raw !== "false";
}

function getConnectedFileMeta() {
  try {
    const raw = localStorage.getItem(NIT_CONNECTED_FILE_META_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NIT_HANDLE_DB, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NIT_HANDLE_STORE)) {
        db.createObjectStore(NIT_HANDLE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadConnectedHandles() {
  const db = await openHandleDb();
  const handles = await new Promise((resolve, reject) => {
    const tx = db.transaction(NIT_HANDLE_STORE, "readonly");
    const req = tx.objectStore(NIT_HANDLE_STORE).get(NIT_HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handles;
}

function DashboardPage() {
  const { user, loading: authLoading, hasFirebaseConfig } = useAuth();
  const { data, loading } = useUserCollections(user?.uid);
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [factionFilter, setFactionFilter] = useState("all");
  const [realmFilter, setRealmFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [needFilter, setNeedFilter] = useState("needed");
  const [availabilityFilter, setAvailabilityFilter] = useState("any");

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

  const filteredEntries = useMemo(() => {
    const entries = visibleCharacters.map((character) => {
      const lootItems = data.lootItems.filter((item) => item.characterId === character.id);
      const remainingLootItems = lootItems.filter((item) => !item.obtained);
      const raidStatuses = data.raidStatuses.filter((status) => status.characterId === character.id);
      const metrics = calculateUrgency(lootItems, raidStatuses);

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
        metrics,
        raidSummary: raidNeedsSummary,
        lockedRaidSummary,
        raidItemsByRaid,
        classIcon: getClassIcon(character.class)
      };
    });

    const sortedEntries = sortCharactersByUrgency(entries);

    return sortedEntries.filter((entry) => {
      const needsMatch = needFilter === "all" || entry.metrics.remaining > 0;
      let availabilityMatch = true;
      if (availabilityFilter === "locked") {
        availabilityMatch = entry.metrics.lockedOut > 0;
      }
      if (availabilityFilter === "reset-ready") {
        availabilityMatch = entry.raidItemsByRaid.length > 0;
      }
      const classMatch = classFilter === "all" || entry.character.class === classFilter;
      const factionMatch = factionFilter === "all" || entry.character.faction === factionFilter;
      const realmMatch = realmFilter === "all" || entry.character.realm === realmFilter;
      const accountValue = entry.character.accountId || "unassigned";
      const accountMatch = accountFilter === "all" || accountValue === accountFilter;
      const nameMatch =
        !searchTerm.trim() || normalize(entry.character.name).includes(normalize(searchTerm));

      return (
        needsMatch
        && availabilityMatch
        && classMatch
        && factionMatch
        && realmMatch
        && accountMatch
        && nameMatch
      );
    });
  }, [
    visibleCharacters,
    data.lootItems,
    data.raidStatuses,
    needFilter,
    availabilityFilter,
    classFilter,
    factionFilter,
    realmFilter,
    accountFilter,
    searchTerm
  ]);

  const syncFromLuaTexts = useCallback(async (luaTexts, { silent = false } = {}) => {
    if (!user) {
      return;
    }

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
        parsed.push(...parseNovaSavedInstances(source.text));
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
            avatarUrl: "",
            showOnDashboard: true,
            importedFromNova: true
          };
          const created = await addCharacter(user.uid, payload);
          const createdCharacter = { id: created.id, ...payload };
          charactersByKey.set(key, createdCharacter);
          createdCharacters.push(createdCharacter);
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

      const stamp = new Date().toLocaleTimeString();
      setLastSyncAt(new Date());
      setSyncStatus("success");
      if (silent) {
        setSyncMessage(`Auto-sync complete at ${stamp}.`);
      } else {
        setSyncMessage(
          `Sync complete. Imported ${parsed.length} saved raid entries and added ${createdCharacters.length} new characters.`
        );
      }
    } catch {
      setSyncStatus("error");
      if (!silent) {
        setSyncMessage("Sync failed. Ensure you selected valid NovaInstanceTracker.lua files.");
      }
    } finally {
      setIsSyncing(false);
    }
  }, [data.accounts, data.characters, user]);

  const onSyncFromConnectedFiles = useCallback(async (silent = false) => {
    if (!window.indexedDB) {
      setSyncStatus("warn");
      if (!silent) {
        setSyncMessage("Browser does not support connected file sync. Use manual file picker sync.");
      }
      return;
    }

    try {
      const handles = await loadConnectedHandles();
      if (!handles.length) {
        if (silent) {
          setSyncStatus("warn");
        }
        if (!silent) {
          setSyncMessage("No connected Nova files yet. Connect files in Settings.");
        }
        return;
      }

      const selectedIndexes = getSelectedConnectedFileIndexes();
      const meta = getConnectedFileMeta();
      const selectedHandles = selectedIndexes.length
        ? selectedIndexes.map((index) => handles[index]).filter(Boolean)
        : handles;
      const selectedSources = selectedIndexes.length
        ? selectedIndexes
            .map((index) => ({
              handle: handles[index],
              accountHintName: meta[index]?.accountName || ""
            }))
            .filter((entry) => entry.handle)
        : handles.map((handle, index) => ({
            handle,
            accountHintName: meta[index]?.accountName || ""
          }));

      if (!selectedHandles.length) {
        if (!silent) {
          setSyncStatus("warn");
          setSyncMessage("No files selected for sync. Select files in Settings.");
        }
        return;
      }

      const sources = [];
      for (const source of selectedSources) {
        const handle = source.handle;
        let permission = "granted";
        if (handle.queryPermission) {
          permission = await handle.queryPermission({ mode: "read" });
        }

        if (permission !== "granted") {
          if (silent) {
            return;
          }

          if (handle.requestPermission) {
            permission = await handle.requestPermission({ mode: "read" });
          }
        }

        if (permission !== "granted") {
          if (!silent) {
            setSyncStatus("warn");
            setSyncMessage("Permission denied for one or more connected files.");
          }
          return;
        }

        const file = await handle.getFile();
        sources.push({ text: await file.text(), accountHintName: source.accountHintName });
      }

      await syncFromLuaTexts(sources, { silent });
    } catch {
      setSyncStatus("warn");
      if (!silent) {
        setSyncMessage("Could not read selected connected files. Reconnect files in Settings.");
      }
    }
  }, [syncFromLuaTexts]);

  useEffect(() => {
    if (!user || !isAutoSyncEnabled()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      onSyncFromConnectedFiles(true);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [onSyncFromConnectedFiles, user]);

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
    setNeedFilter("needed");
    setAvailabilityFilter("any");
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
      <div className="panel-heading">
        <div>
          <h2>Priority Dashboard</h2>
          <p>Weekly reset in {formatCountdown(nextReset)}</p>
        </div>
        <div className="row-actions">
          <span className={`sync-pill ${syncStatus}`}>
            Sync: {syncLabel} | Last: {lastSyncAt ? lastSyncAt.toLocaleTimeString() : "Never"}
          </span>
          <button type="button" onClick={() => onSyncFromConnectedFiles()} disabled={isSyncing}>
            {isSyncing ? "Syncing..." : "Sync from Nova"}
          </button>
        </div>
      </div>
      {syncMessage ? <p className="subtitle">{syncMessage}</p> : null}

      <div className="dashboard-filters">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search character name"
        />
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
        <button type="button" onClick={resetFilters} className="secondary-btn">
          Clear
        </button>
      </div>

      {!filteredEntries.length ? (
        <p className="empty-panel">No characters match the current dashboard filters.</p>
      ) : (
        <div className="card-grid">
          {filteredEntries.map((entry) => (
            <CharacterCard
              key={entry.character.id}
              character={entry.character}
              metrics={entry.metrics}
              raidSummary={entry.raidSummary}
              lockedRaidSummary={entry.lockedRaidSummary}
              raidItemsByRaid={entry.raidItemsByRaid}
              classIcon={entry.classIcon}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default DashboardPage;
