import { useEffect, useRef, useState } from "react";
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

function SettingsPage() {
  const { user, hasFirebaseConfig, signInWithGoogle, signOutUser } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const [nitPathInput, setNitPathInput] = useState("");
  const [nitPaths, setNitPaths] = useState([]);
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showOnlyLevel60, setShowOnlyLevel60] = useState(false);
  const [savingVisibilityId, setSavingVisibilityId] = useState("");
  const [connectedFileNames, setConnectedFileNames] = useState([]);
  const fileInputRef = useRef(null);
  const accountNameById = new Map(data.accounts.map((account) => [account.id, account.battleNetId]));

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
    if (!window.indexedDB) {
      return;
    }

    loadConnectedHandles()
      .then((handles) => {
        const names = handles
          .map((handle) => handle?.name)
          .filter(Boolean);
        setConnectedFileNames(names);
      })
      .catch(() => {
        setConnectedFileNames([]);
      });
  }, []);

  const savePaths = (paths) => {
    setNitPaths(paths);
    localStorage.setItem(NIT_PATHS_KEY, JSON.stringify(paths));
  };

  const addPath = () => {
    const trimmed = nitPathInput.trim();
    if (!trimmed) {
      return;
    }

    const alreadyExists = nitPaths.some((path) => normalize(path) === normalize(trimmed));
    if (alreadyExists) {
      setSyncMessage("That path is already saved.");
      return;
    }

    const next = [...nitPaths, trimmed];
    savePaths(next);
    setNitPathInput("");
    const hintedAccount = getUniqueAccountHint(next);
    if (hintedAccount) {
      setSyncMessage(`Path added. Account hint detected: ${hintedAccount}.`);
    } else {
      setSyncMessage("Path added. Connect files to allow direct updates.");
    }
  };

  const removePath = (pathToRemove) => {
    const next = nitPaths.filter((path) => path !== pathToRemove);
    savePaths(next);
    setSyncMessage("Path removed.");
  };

  const syncFromLuaTexts = async (luaTexts, accountHintName = "") => {
    if (!user) {
      return;
    }

    setIsSyncing(true);
    setSyncMessage("Sync in progress...");

    try {
      const accountMap = new Map(data.accounts.map((account) => [normalize(account.battleNetId), account.id]));
      let hintAccountId = "";
      if (accountHintName) {
        const normalized = normalize(accountHintName);
        hintAccountId = accountMap.get(normalized) || "";
        if (!hintAccountId) {
          const created = await addAccount(user.uid, accountHintName);
          hintAccountId = created.id;
          accountMap.set(normalized, hintAccountId);
        }
      }

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
      const defaultAccountId = hintAccountId || (data.accounts.length === 1 ? data.accounts[0].id : "");

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

  const onPickFile = () => {
    fileInputRef.current?.click();
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

      await saveConnectedHandles(handles);
      setConnectedFileNames(handles.map((handle) => handle.name));
      setSyncMessage(`Connected ${handles.length} Nova file(s). Update will now use these automatically.`);
    } catch {
      // User cancelled picker.
    }
  };

  const onUpdateFromConnectedFiles = async () => {
    const accountHintName = resolveAccountHint(nitPaths, nitPathInput.trim());
    try {
      const handles = await loadConnectedHandles();
      if (!handles.length) {
        onPickFile();
        return;
      }

      const texts = [];
      for (const handle of handles) {
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
        texts.push(await file.text());
      }

      await syncFromLuaTexts(texts, accountHintName);
    } catch {
      setSyncMessage("Could not read connected files. Click Update again and pick files manually.");
      onPickFile();
    }
  };

  const onFileSelected = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    const accountHintName = resolveAccountHint(nitPaths, nitPathInput.trim());
    const texts = await Promise.all(files.map((file) => file.text()));
    await syncFromLuaTexts(texts, accountHintName);
    event.target.value = "";
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
      await saveConnectedHandles([]);
      setNitPaths([]);
      setConnectedFileNames([]);
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

          <div className="panel">
            <h3>NovaInstanceTracker Sync</h3>
            <p>
              Add Path stores a reference and account hint only. Browsers cannot read local files
              by path on hosted sites, so click Connect Nova Files once for one-click updates.
            </p>
            <input
              value={nitPathInput}
              onChange={(event) => setNitPathInput(event.target.value)}
              placeholder="d:/WoW/World of Warcraft/_classic_era_/WTF/Account/.../NovaInstanceTracker.lua"
            />
            <div className="row-actions">
              <button type="button" onClick={addPath}>
                Add Path
              </button>
              <button type="button" onClick={onConnectFiles} disabled={isSyncing}>
                Connect Nova Files
              </button>
              <button type="button" onClick={onUpdateFromConnectedFiles} disabled={isSyncing}>
                {isSyncing ? "Updating..." : "Update from NovaInstanceTracker"}
              </button>
            </div>
            <p className="subtitle">
              Account hint: {resolveAccountHint(nitPaths, nitPathInput.trim()) || "Not detected"}
            </p>
            <ul className="simple-list">
              {connectedFileNames.length ? (
                connectedFileNames.map((fileName) => <li key={fileName}>{fileName}</li>)
              ) : (
                <li>No connected files yet. Click Connect Nova Files once.</li>
              )}
            </ul>
            {nitPaths.length ? (
              <ul className="simple-list">
                {nitPaths.map((path) => (
                  <li key={path}>
                    <span>{path}</span>
                    <button type="button" className="danger" onClick={() => removePath(path)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept=".lua,text/plain"
              multiple
              className="hidden-input"
              onChange={onFileSelected}
            />
            <p className="subtitle">
              Browser security blocks direct path reading on GitHub Pages, so Update uses a file picker.
            </p>
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
