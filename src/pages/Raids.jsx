import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { upsertRaidStatus } from "../services/dataService";
import { getNextWeeklyReset } from "../utils/raidReset";

function RaidsPage() {
  const { user } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const [savingKey, setSavingKey] = useState("");

  if (!user) {
    return <p className="empty-panel">Sign in to manage raid lockouts.</p>;
  }

  const getStatus = (characterId, raidName) => {
    return data.raidStatuses.find(
      (status) => status.characterId === characterId && status.raidName === raidName
    );
  };

  const onToggleRaid = async (characterId, raidName, checked) => {
    const key = `${characterId}-${raidName}`;
    setSavingKey(key);

    const now = new Date();
    await upsertRaidStatus(user.uid, {
      characterId,
      raidName,
      completed: checked,
      lastRunDate: checked ? now.toISOString() : null,
      resetDate: checked ? getNextWeeklyReset(now).toISOString() : null
    });

    setSavingKey("");
  };

  return (
    <section className="panel">
      <h2>Raid Lockout Tracking</h2>
      {!data.characters.length ? (
        <p>Add characters first.</p>
      ) : (
        <div className="raid-table-wrapper">
          <table className="raid-table">
            <thead>
              <tr>
                <th>Character</th>
                {RAIDS.map((raid) => (
                  <th key={raid.name}>{raid.short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.characters.map((character) => (
                <tr key={character.id}>
                  <td>{character.name}</td>
                  {RAIDS.map((raid) => {
                    const status = getStatus(character.id, raid.name);
                    const isBusy = savingKey === `${character.id}-${raid.name}`;

                    return (
                      <td key={raid.name}>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={Boolean(status?.completed)}
                            disabled={isBusy}
                            onChange={(event) =>
                              onToggleRaid(character.id, raid.name, event.target.checked)
                            }
                          />
                          <span>
                            {status?.resetDate
                              ? new Date(status.resetDate).toLocaleDateString()
                              : "Open"}
                          </span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default RaidsPage;
