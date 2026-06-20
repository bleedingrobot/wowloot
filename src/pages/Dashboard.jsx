import { useMemo } from "react";
import CharacterCard from "../components/CharacterCard";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { getNextWeeklyReset, formatCountdown } from "../utils/raidReset";
import { calculateUrgency, sortCharactersByUrgency } from "../utils/urgency";
import { getClassIcon } from "../utils/classIcons";

function DashboardPage() {
  const { user, loading: authLoading, hasFirebaseConfig } = useAuth();
  const { data, loading } = useUserCollections(user?.uid);

  const nextReset = getNextWeeklyReset();

  const sorted = useMemo(() => {
    const entries = data.characters.map((character) => {
      const lootItems = data.lootItems.filter((item) => item.characterId === character.id);
      const raidStatuses = data.raidStatuses.filter((status) => status.characterId === character.id);
      const metrics = calculateUrgency(lootItems, raidStatuses);

      const dueRaids = RAIDS.filter((raid) => {
        const status = raidStatuses.find((s) => s.raidName === raid.name);
        if (!status) {
          return true;
        }
        if (!status.completed) {
          return true;
        }
        return status.resetDate ? new Date(status.resetDate) <= new Date() : true;
      }).length;

      return {
        character,
        metrics,
        completion: metrics.totalLoot ? Math.round((metrics.obtained / metrics.totalLoot) * 100) : 0,
        raidSummary: `${dueRaids} raids currently available`,
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
