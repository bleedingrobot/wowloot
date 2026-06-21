import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { upsertRaidStatus } from "../services/dataService";
import { parseNovaSavedInstances } from "../utils/novaInstanceParser";

const NIT_PATH_KEY = "nit_savedvariables_path";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function SettingsPage() {
  const { user, hasFirebaseConfig, signInWithGoogle, signOutUser } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const [nitPath, setNitPath] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const savedPath = localStorage.getItem(NIT_PATH_KEY);
    if (savedPath) {
      setNitPath(savedPath);
    }
  }, []);

  const savePath = () => {
    localStorage.setItem(NIT_PATH_KEY, nitPath.trim());
    setSyncMessage("NovaInstanceTracker path saved.");
  };

  const syncFromLuaText = async (luaText) => {
    if (!user) {
      return;
    }

    setIsSyncing(true);
    setSyncMessage("Sync in progress...");

    try {
      const parsed = parseNovaSavedInstances(luaText);
      const parsedByCharacter = new Map();

      parsed.forEach((entry) => {
        const key = `${normalize(entry.characterName)}|${normalize(entry.realm)}`;
        if (!parsedByCharacter.has(key)) {
          parsedByCharacter.set(key, []);
        }
        parsedByCharacter.get(key).push(entry);
      });

      const updates = [];

      data.characters.forEach((character) => {
        const key = `${normalize(character.name)}|${normalize(character.realm)}`;
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
      setSyncMessage(`Sync complete. Imported ${totalMatches} saved raid entries from NovaInstanceTracker.`);
    } catch (error) {
      setSyncMessage("Sync failed. Ensure you selected a valid NovaInstanceTracker.lua file.");
    } finally {
      setIsSyncing(false);
    }
  };

  const onPickFile = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    await syncFromLuaText(text);
    event.target.value = "";
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
              Save your Lua file path for reference, then click Update to import saved raid lockouts.
            </p>
            <input
              value={nitPath}
              onChange={(event) => setNitPath(event.target.value)}
              placeholder="d:/WoW/World of Warcraft/_classic_era_/WTF/Account/.../NovaInstanceTracker.lua"
            />
            <div className="row-actions">
              <button type="button" onClick={savePath}>
                Save Path
              </button>
              <button type="button" onClick={onPickFile} disabled={isSyncing}>
                {isSyncing ? "Updating..." : "Update from NovaInstanceTracker"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".lua,text/plain"
              className="hidden-input"
              onChange={onFileSelected}
            />
            <p className="subtitle">
              Browser security blocks direct path reading on GitHub Pages, so Update uses a file picker.
            </p>
            {syncMessage ? <p>{syncMessage}</p> : null}
          </div>

          <button type="button" onClick={signOutUser}>
            Sign Out
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
