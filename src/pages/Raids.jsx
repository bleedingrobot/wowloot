import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { formatCountdown, isRaidLocked } from "../utils/raidReset";

function RaidsPage() {
  const { user } = useAuth();
  const { data } = useUserCollections(user?.uid);

  if (!user) {
    return <p className="empty-panel">Sign in to view raid lockouts.</p>;
  }

  const accountNameById = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account.battleNetId])),
    [data.accounts]
  );

  const getStatus = (characterId, raidName) => {
    return data.raidStatuses.find(
      (status) => status.characterId === characterId && status.raidName === raidName
    );
  };

  const renderStatus = (status) => {
    const locked = isRaidLocked(status);
    if (!locked) {
      return <span className="raid-status-pill open">Open</span>;
    }

    if (!status?.resetDate) {
      return <span className="raid-status-pill locked">Locked</span>;
    }

    const resetDate = new Date(status.resetDate);
    return (
      <div className="raid-status-stack">
        <span className="raid-status-pill locked">Locked</span>
        <span className="raid-reset-meta">Reset in {formatCountdown(resetDate)}</span>
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>Raid Lockout Tracking</h2>
      <p className="subtitle">
        Read-only view from connected NovaInstanceTracker files. Naxx, BWL, AQ40 reset Wednesday
        3:00 AM NZST / 5:00 AM NZDT. ZG, AQ20, and Ony reset every 3 days at 3:00 AM NZ time.
      </p>
      {!data.characters.length ? (
        <p>Add characters first.</p>
      ) : !data.raidStatuses.length ? (
        <p>No synced lockout data yet. Use Settings to connect files and sync.</p>
      ) : (
        <div className="raid-table-wrapper">
          <table className="raid-table">
            <thead>
              <tr>
                <th>Character</th>
                <th>Realm</th>
                <th>Account</th>
                {RAIDS.map((raid) => (
                  <th key={raid.name}>{raid.short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.characters.map((character) => (
                <tr key={character.id}>
                  <td>{character.name}</td>
                  <td>{character.realm || "-"}</td>
                  <td>
                    {character.accountId
                      ? accountNameById.get(character.accountId) || "Unknown account"
                      : "Unassigned"}
                  </td>
                  {RAIDS.map((raid) => {
                    const status = getStatus(character.id, raid.name);
                    return <td key={raid.name}>{renderStatus(status)}</td>;
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
