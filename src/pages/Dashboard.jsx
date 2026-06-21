import { useMemo, useState } from "react";
import CharacterCard from "../components/CharacterCard";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { getNextRaidReset, formatCountdown, isRaidLocked } from "../utils/raidReset";
import { calculateUrgency, sortCharactersByUrgency } from "../utils/urgency";
import { getClassIcon } from "../utils/classIcons";
import { upsertRaidStatus } from "../services/dataService";

function DashboardPage() {
  const { user, loading: authLoading, hasFirebaseConfig } = useAuth();
  const { data, loading } = useUserCollections(user?.uid);
  const [savingKey, setSavingKey] = useState("");

  const nextReset = getNextRaidReset("Naxxramas");

  const sorted = useMemo(() => {
    const visibleCharacters = data.characters.filter((character) => character.showOnDashboard !== false);

    const entries = visibleCharacters.map((character) => {
      const lootItems = data.lootItems.filter((item) => item.characterId === character.id);
      const remainingLootItems = lootItems.filter((item) => !item.obtained);
      const raidStatuses = data.raidStatuses.filter((status) => status.characterId === character.id);
      const metrics = calculateUrgency(lootItems, raidStatuses);

      const availableRaids = RAIDS.filter((raid) => { 
        const status = raidStatuses.find((s) => s.raidName === raid.name);
        return !isRaidLocked(status);
      });

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
        completion: metrics.totalLoot ? Math.round((metrics.obtained / metrics.totalLoot) * 100) : 0,
        raidSummary: raidNeedsSummary,
        raidItemsByRaid,
        classIcon: getClassIcon(character.class)
      };
    });

    return sortCharactersByUrgency(entries);
  }, [data.characters, data.lootItems, data.raidStatuses]);

  if (!hasFirebaseConfig) {
    return <p className="empty-panel">Add Firebase keys in your .env to enable Auth and data sync.</p>;
  }

  if (authLoading || loading) {
    return <p className="empty-panel">Loading dashboard...</p>;
  }

  if (!user) {
    return <p className="empty-panel">Sign in on Settings to view your raid priority dashboard.</p>;
  }

  const onToggleRaidSaved = async (characterId, raidName, checked) => {
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
    <section>
      <div className="panel-heading">
        <h2>Priority Dashboard</h2>
        <p>Weekly reset in {formatCountdown(nextReset)}</p>
      </div>

      {!sorted.length ? (
        <p className="empty-panel">No characters yet. Add one in Characters.</p>
      ) : (
        <div className="card-grid">
          {sorted.map((entry) => (
            <CharacterCard
              key={entry.character.id}
              character={entry.character}
              metrics={entry.metrics}
              raidSummary={entry.raidSummary}
              raidItemsByRaid={entry.raidItemsByRaid}
              savingKey={savingKey}
              onToggleRaidSaved={onToggleRaidSaved}
              classIcon={entry.classIcon}
              completion={entry.completion}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default DashboardPage;
