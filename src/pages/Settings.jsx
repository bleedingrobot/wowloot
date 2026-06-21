import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import {
  addAccount,
  addCharacter,
  deleteAllUserData,
  updateCharacter,
  upsertRaidStatus
} from "../services/dataService";
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

function getUniqueAccountHint(paths) {
  const accounts = Array.from(
    new Set(paths.map((path) => extractAccountFromPath(path)).filter(Boolean))
  );
  return accounts.length === 1 ? accounts[0] : "";
}

function resolveAccountHint(paths, inputPath) {
  const inputHint = extractAccountFromPath(inputPath);
  if (inputHint) {
    return inputHint;
  }
  return getUniqueAccountHint(paths);
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

async function saveConnectedHandles(handles) {
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(NIT_HANDLE_STORE, "readwrite");
    tx.objectStore(NIT_HANDLE_STORE).put(handles, NIT_HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
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

async function hasSameEntry(handleA, handleB) {
  if (typeof handleA?.isSameEntry !== "function") {
    return false;
  }

  try {
    return await handleA.isSameEntry(handleB);
  } catch {
    return false;
  }
}

async function mergeConnectedHandles(existingHandles, newHandles) {
  const merged = [...existingHandles];

  for (const nextHandle of newHandles) {
    let exists = false;

    for (const currentHandle of merged) {
      if (await hasSameEntry(currentHandle, nextHandle)) {
        exists = true;
        break;
      }
    }

    if (!exists) {
      merged.push(nextHandle);
    }
  }

  return merged;
}

function readConnectedFileMeta() {
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

function saveConnectedFileMeta(meta) {
  localStorage.setItem(NIT_CONNECTED_FILE_META_KEY, JSON.stringify(meta));
}

function SettingsPage() {
  const { user, hasFirebaseConfig, signInWithGoogle, signOutUser } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const [nitPaths, setNitPaths] = useState([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [isAssigningAccount, setIsAssigningAccount] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showOnlyLevel60, setShowOnlyLevel60] = useState(false);
  const [savingVisibilityId, setSavingVisibilityId] = useState("");
  const [connectedFiles, setConnectedFiles] = useState([]);
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

  const hydrateConnectedFiles = useCallback(() => {
    if (!window.indexedDB) {
      return;
    }

    loadConnectedHandles()
      .then((handles) => {
        const selectedIndexes = readSelectedFileIndexes();
        const meta = readConnectedFileMeta();
        const selectedSet = new Set(selectedIndexes);
        const hasSelection = selectedSet.size > 0;

        setConnectedFiles(
          handles.map((handle, index) => ({
            id: `${handle?.name || "file"}-${index}`,
            name: handle?.name || "Unknown file",
            selected: hasSelection ? selectedSet.has(index) : true,
            accountName: meta[index]?.accountName || "",
            handle
          }))
        );
      })
      .catch(() => {
        setConnectedFiles([]);
      });
  }, []);

  useEffect(() => {
    hydrateConnectedFiles();
  }, [hydrateConnectedFiles]);

  useEffect(() => {
    const raw = localStorage.getItem(NIT_AUTO_SYNC_ENABLED_KEY);
    if (raw === null) {
      return;
    }
    setAutoSyncEnabled(raw !== "false");
  }, []);

  useEffect(() => {
    localStorage.setItem(NIT_AUTO_SYNC_ENABLED_KEY, autoSyncEnabled ? "true" : "false");
  }, [autoSyncEnabled]);

  const savePaths = (paths) => {
    setNitPaths(paths);
    localStorage.setItem(NIT_PATHS_KEY, JSON.stringify(paths));
  };

  const ensureAccountIdFromHint = async (accountHintName) => {
    if (!accountHintName) {
      return "";
    }

    const accountMap = new Map(data.accounts.map((account) => [normalize(account.battleNetId), account.id]));
    const normalized = normalize(accountHintName);
    const existingId = accountMap.get(normalized);
    if (existingId) {
      return existingId;
    }

    const created = await addAccount(user.uid, accountHintName);
    return created.id;
  };

  const assignUnassignedCharacters = async (accountId) => {
    const targets = data.characters.filter((character) => !character.accountId);
    await Promise.all(targets.map((character) => updateCharacter(character.id, { accountId })));
    return targets.length;
  };

  const onAssignUnassignedToDetectedAccount = async () => {
    if (!user || isAssigningAccount) {
      return;
    }

    const hintName = getUniqueAccountHint(nitPaths);
    if (!hintName) {
      setSyncMessage("No account hint detected from saved paths yet.");
      return;
    }

    setIsAssigningAccount(true);
    try {
      const accountId = await ensureAccountIdFromHint(hintName);
      const assignedCount = await assignUnassignedCharacters(accountId);
      if (assignedCount) {
        setSyncMessage(`Assigned ${assignedCount} unassigned character(s) to ${hintName}.`);
      } else {
        setSyncMessage(`No unassigned characters found. ${hintName} is already applied.`);
      }
    } catch {
      setSyncMessage("Could not assign unassigned characters right now.");
    } finally {
      setIsAssigningAccount(false);
    }
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
            await updateCharacter(existing.id, { level: parsedCharacter.level });
            existing.level = parsedCharacter.level;
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
      setSyncMessage(
        `Sync complete. Imported ${totalMatches} saved raid entries and added ${createdCharacters.length} new characters.`
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
      const accountHintInput = window.prompt("Account name for these files (example: JAMESRILEY)", "");
      if (accountHintInput === null) {
        return;
      }
      const accountHintName = accountHintInput.trim();
      const existingHandles = await loadConnectedHandles();
      const existingMeta = readConnectedFileMeta();
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

      const merged = await mergeConnectedHandles(existingHandles, handles);
      const addedCount = merged.length - existingHandles.length;
      const nextMeta = [...existingMeta];
      for (let index = 0; index < addedCount; index += 1) {
        nextMeta.push({ accountName: accountHintName });
      }

      await saveConnectedHandles(merged);
      saveConnectedFileMeta(nextMeta);
      setConnectedFiles(
        merged.map((handle, index) => ({
          id: `${handle?.name || "file"}-${index}`,
          name: handle?.name || "Unknown file",
          selected: true,
          accountName: nextMeta[index]?.accountName || "",
          handle
        }))
      );
      saveSelectedFileIndexes(merged.map((_, index) => index));
      setSyncMessage(
        `Added ${handles.length} file selection(s). ${merged.length} Nova file(s) now connected.`
      );
    } catch {
      // User cancelled picker.
    }
  };

  const onUpdateFromConnectedFiles = async (silent = false) => {
    try {
      const selectedSources = connectedFiles
        .filter((item) => item.selected)
        .map((item) => ({ handle: item.handle, accountHintName: item.accountName }));

      if (!selectedSources.length) {
        if (!silent) {
          setSyncMessage("Select at least one connected Nova file to sync.");
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
        if (permission !== "granted" && handle.requestPermission) {
          permission = await handle.requestPermission({ mode: "read" });
        }
        if (permission !== "granted") {
          throw new Error("permission-denied");
        }

        const file = await handle.getFile();
        sources.push({
          text: await file.text(),
          accountHintName: source.accountHintName
        });
      }

      await syncFromLuaTexts(sources);
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
    saveConnectedFileMeta(next.map((item) => ({ accountName: item.accountName || "" })));
    const selectedIndexes = next
      .map((item, index) => (item.selected ? index : -1))
      .filter((value) => value >= 0);
    saveSelectedFileIndexes(selectedIndexes);
    setSyncMessage(`Connected file removed. ${next.length} remaining.`);
  };

  useEffect(() => {
    if (!user || !autoSyncEnabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      onUpdateFromConnectedFiles(true);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [autoSyncEnabled, connectedFiles, user]);

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
      localStorage.removeItem(NIT_CONNECTED_FILE_META_KEY);
      await saveConnectedHandles([]);
      setNitPaths([]);
      setConnectedFiles([]);
      saveSelectedFileIndexes([]);
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
              Connect Nova files once, then choose which connected files to sync now or auto-sync every
              5 minutes.
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={onAssignUnassignedToDetectedAccount}
                disabled={isAssigningAccount}
              >
                {isAssigningAccount ? "Assigning..." : "Assign Unassigned to Detected Account"}
              </button>
              <button type="button" onClick={onConnectFiles} disabled={isSyncing}>
                Connect Nova
              </button>
              <button type="button" onClick={onUpdateFromConnectedFiles} disabled={isSyncing}>
                {isSyncing ? "Syncing..." : "Sync Selected"}
              </button>
            </div>
            <p className="subtitle">
              Auto-sync every 5 minutes
              <label className="saved-toggle" style={{ marginLeft: "0.55rem" }}>
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  onChange={(event) => setAutoSyncEnabled(event.target.checked)}
                />
                Enabled
              </label>
            </p>
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
                    <button
                      type="button"
                      className="danger"
                      onClick={() => onRemoveConnectedFile(item.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))
              ) : (
                <li>No connected files yet. Click Connect Nova once.</li>
              )}
            </ul>
            {syncMessage ? <p>{syncMessage}</p> : null}
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
