import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useUserCollections } from "../hooks/useUserCollections";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function formatNumber(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe < 0) {
    return "0";
  }
  return Math.floor(safe).toLocaleString();
}

function getRestedXp(character) {
  const lowerCamel = Number(character?.restedXp);
  if (Number.isFinite(lowerCamel) && lowerCamel > 0) {
    return lowerCamel;
  }

  const upperCamel = Number(character?.restedXP);
  if (Number.isFinite(upperCamel) && upperCamel > 0) {
    return upperCamel;
  }

  return 0;
}

function RestedXpPage() {
  const { user, loading: authLoading, hasFirebaseConfig } = useAuth();
  const { data, loading } = useUserCollections(user?.uid);

  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [factionFilter, setFactionFilter] = useState("all");
  const [realmFilter, setRealmFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [minRestedFilter, setMinRestedFilter] = useState("");

  const accountNameById = useMemo(
    () => new Map(data.accounts.map((account) => [account.id, account.battleNetId])),
    [data.accounts]
  );

  const allCharacters = useMemo(() => data.characters, [data.characters]);

  const classOptions = useMemo(
    () => Array.from(new Set(allCharacters.map((character) => character.class).filter(Boolean))).sort(),
    [allCharacters]
  );
  const factionOptions = useMemo(
    () => Array.from(new Set(allCharacters.map((character) => character.faction).filter(Boolean))).sort(),
    [allCharacters]
  );
  const realmOptions = useMemo(
    () => Array.from(new Set(allCharacters.map((character) => character.realm).filter(Boolean))).sort(),
    [allCharacters]
  );
  const accountOptions = useMemo(() => {
    const map = new Map();

    allCharacters.forEach((character) => {
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
  }, [allCharacters, accountNameById]);

  const rows = useMemo(() => {
    const threshold = Number(minRestedFilter);
    const hasThreshold = minRestedFilter !== "" && !Number.isNaN(threshold);

    return allCharacters
      .filter((character) => {
        const level = Number(character.level);
        if (!Number.isFinite(level) || level < 15 || level >= 60) {
          return false;
        }

        const safeRestedXp = getRestedXp(character);
        if (safeRestedXp <= 0) {
          return false;
        }
        const classMatch = classFilter === "all" || character.class === classFilter;
        const factionMatch = factionFilter === "all" || character.faction === factionFilter;
        const realmMatch = realmFilter === "all" || character.realm === realmFilter;
        const accountValue = character.accountId || "unassigned";
        const accountMatch = accountFilter === "all" || accountValue === accountFilter;
        const nameMatch = !searchTerm.trim() || normalize(character.name).includes(normalize(searchTerm));
        const restedMatch = !hasThreshold || safeRestedXp >= threshold;

        return classMatch && factionMatch && realmMatch && accountMatch && nameMatch && restedMatch;
      })
      .map((character) => {
        const safeRestedXp = getRestedXp(character);

        return {
          id: character.id,
          name: character.name,
          realm: character.realm || "Unknown",
          account: character.accountId ? accountNameById.get(character.accountId) || "Unknown account" : "Unassigned",
          className: character.class || "Unknown",
          faction: character.faction || "Unknown",
          level: character.level,
          restedXp: safeRestedXp
        };
      })
      .sort((a, b) => b.restedXp - a.restedXp || a.name.localeCompare(b.name));
  }, [
    allCharacters,
    classFilter,
    factionFilter,
    realmFilter,
    accountFilter,
    searchTerm,
    minRestedFilter,
    accountNameById
  ]);

  const resetFilters = () => {
    setSearchTerm("");
    setClassFilter("all");
    setFactionFilter("all");
    setRealmFilter("all");
    setAccountFilter("all");
    setMinRestedFilter("");
  };

  if (!hasFirebaseConfig) {
    return <p className="empty-panel">Add Firebase keys in your .env to enable Auth and data sync.</p>;
  }

  if (authLoading || loading) {
    return <p className="empty-panel">Loading rested XP...</p>;
  }

  return (
    <section>
      <div className="panel-heading">
        <div>
          <h2>Rested XP Boost List</h2>
          <p className="subtitle">Characters level 15-59, sorted by most rested XP first.</p>
        </div>
      </div>

      <div className="dashboard-filters rested-filters">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search character name"
        />
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
          value={minRestedFilter}
          onChange={(event) => setMinRestedFilter(event.target.value)}
          placeholder="Rested XP >= X"
        />
        <button type="button" className="secondary-btn" onClick={resetFilters}>
          Reset
        </button>
      </div>

      <div className="panel">
        <h3>Eligible Characters ({rows.length})</h3>
        <div className="raid-table-wrapper">
          <table className="raid-table">
            <thead>
              <tr>
                <th>Character</th>
                <th>Level</th>
                <th>Class</th>
                <th>Faction</th>
                <th>Realm</th>
                <th>Account</th>
                <th>Rested XP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.level ?? "-"}</td>
                    <td>{row.className}</td>
                    <td>{row.faction}</td>
                    <td>{row.realm}</td>
                    <td>{row.account}</td>
                    <td>{formatNumber(row.restedXp)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="empty-panel">No sub-60 characters with rested XP matched your filters. Run Nova sync to refresh rested XP values.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default RestedXpPage;
