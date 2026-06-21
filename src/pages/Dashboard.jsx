import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CharacterCard from "../components/CharacterCard";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { getNextRaidReset, formatCountdown, isRaidLocked } from "../utils/raidReset";
import { calculateUrgency, sortCharactersByUrgency } from "../utils/urgency";
import { getClassIcon } from "../utils/classIcons";
import { addCharacter, upsertRaidStatus } from "../services/dataService";
import { parseNovaCharacters, parseNovaSavedInstances } from "../utils/novaInstanceParser";

const NIT_HANDLE_DB = "wowloot-nit-handles";
const NIT_HANDLE_STORE = "handles";
const NIT_HANDLE_KEY = "nova-files";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function characterKey(name, realm) {
  return `${normalize(name)}|${normalize(realm)}`;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [factionFilter, setFactionFilter] = useState("all");
  const [realmFilter, setRealmFilter] = useState("all");
  const [needFilter, setNeedFilter] = useState("needed");
  const fileInputRef = useRef(null);

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
      const classMatch = classFilter === "all" || entry.character.class === classFilter;
      const factionMatch = factionFilter === "all" || entry.character.faction === factionFilter;
      const realmMatch = realmFilter === "all" || entry.character.realm === realmFilter;
      const nameMatch =
        !searchTerm.trim() || normalize(entry.character.name).includes(normalize(searchTerm));

      return needsMatch && classMatch && factionMatch && realmMatch && nameMatch;
    });
  }, [
    visibleCharacters,
    data.lootItems,
    data.raidStatuses,
    needFilter,
    classFilter,
    factionFilter,
    realmFilter,
    searchTerm
  ]);

  const syncFromLuaTexts = useCallback(async (luaTexts, { silent = false } = {}) => {
    if (!user) {
      return;
    }

    setIsSyncing(true);
    if (!silent) {
      setSyncMessage("Sync in progress...");
    }

    try {
      const parsedCharacters = luaTexts.flatMap((text) => parseNovaCharacters(text));
      const parsed = luaTexts.flatMap((text) => parseNovaSavedInstances(text));

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

      for (const parsedCharacter of dedupedParsedCharacters.values()) {
        const key = characterKey(parsedCharacter.name, parsedCharacter.realm);
        if (!charactersByKey.has(key)) {
          const payload = {
            name: parsedCharacter.name,
            class: parsedCharacter.className || "Unknown",
            faction: parsedCharacter.faction || "Unknown",
            realm: parsedCharacter.realm,
            accountId: "",
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
      if (silent) {
        setSyncMessage(`Auto-sync complete at ${stamp}.`);
      } else {
        setSyncMessage(
          `Sync complete. Imported ${parsed.length} saved raid entries and added ${createdCharacters.length} new characters.`
        );
      }
    } catch {
      if (!silent) {
        setSyncMessage("Sync failed. Ensure you selected valid NovaInstanceTracker.lua files.");
      }
    } finally {
      setIsSyncing(false);
    }
  }, [data.characters, user]);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    const texts = await Promise.all(files.map((file) => file.text()));
    await syncFromLuaTexts(texts);
    event.target.value = "";
  }, [syncFromLuaTexts]);

  const onSyncFromConnectedFiles = useCallback(async (silent = false) => {
    if (!window.indexedDB) {
      if (!silent) {
        setSyncMessage("Browser does not support connected file sync. Use manual file picker sync.");
      }
      return;
    }

    try {
      const handles = await loadConnectedHandles();
      if (!handles.length) {
        if (!silent) {
          onPickFile();
        }
        return;
      }

      const texts = [];
      for (const handle of handles) {
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
            setSyncMessage("Permission denied for one or more connected files.");
          }
          return;
        }

        const file = await handle.getFile();
        texts.push(await file.text());
      }

      await syncFromLuaTexts(texts, { silent });
    } catch {
      if (!silent) {
        setSyncMessage("Could not read connected files. Use manual file picker sync.");
        onPickFile();
      }
    }
  }, [onPickFile, syncFromLuaTexts]);

  useEffect(() => {
    if (!user) {
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
    setNeedFilter("needed");
  };

  return (
    <section>
      <div className="panel-heading">
        <div>
          <h2>Priority Dashboard</h2>
          <p>Weekly reset in {formatCountdown(nextReset)}</p>
        </div>
        <div className="row-actions">
          <button type="button" onClick={() => onSyncFromConnectedFiles()} disabled={isSyncing}>
            {isSyncing ? "Syncing..." : "Sync from Nova"}
          </button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".lua,text/plain"
        multiple
        className="hidden-input"
        onChange={onFileSelected}
      />
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
