import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { upsertRaidStatus } from "../services/dataService";
import { getNextRaidReset, isRaidLocked } from "../utils/raidReset";

function RaidsPage() {
  const { user } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const [savingKey, setSavingKey] = useState("");

  useEffect(() => {
    if (!user || !data.raidStatuses.length) {
      return;
    }

    const now = new Date();
    const expired = data.raidStatuses.filter(
      (status) => status.completed && status.resetDate && new Date(status.resetDate) <= now
    );

    if (!expired.length) {
      return;
    }

    Promise.all(
      expired.map((status) =>
        upsertRaidStatus(user.uid, {
          characterId: status.characterId,
          raidName: status.raidName,
          completed: false,
          lastRunDate: null,
          resetDate: null
        })
      )
    ).catch(() => {
      // Keep UI responsive even if one cleanup update fails.
    });
  }, [user, data.raidStatuses]);

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
      resetDate: checked ? getNextRaidReset(raidName, now).toISOString() : null
    });

    setSavingKey("");
  };

  return (
    <section className="panel">
      <h2>Raid Lockout Tracking</h2>
      <p className="subtitle">
        Naxx, BWL, AQ40 reset Wednesday 3:00 AM NZST / 5:00 AM NZDT. ZG, AQ20, and Ony reset
        every 3 days at 3:00 AM NZ time.
      </p>
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
                    const locked = isRaidLocked(status);

                    return (
                      <td key={raid.name}>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={locked}
                            disabled={isBusy}
                            onChange={(event) =>
                              onToggleRaid(character.id, raid.name, event.target.checked)
                            }
                          />
                          <span>
                            {locked && status?.resetDate
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
