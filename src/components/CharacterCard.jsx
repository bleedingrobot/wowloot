import ProgressBar from "./ProgressBar";
import { FALLBACK_ICON } from "../utils/classIcons";

function CharacterCard({ character, metrics, raidSummary, raidItemsByRaid, classIcon, completion }) {

  return (
    <article className="character-card">
      <header className="card-header">
        <img
          className="class-icon"
          src={classIcon}
          alt={`${character.class || "Unknown"} icon`}
          onError={(event) => {
            event.currentTarget.src = FALLBACK_ICON;
          }}
        />
        <div>
          <h3>{character.name}</h3>
          <p>
            {character.class} | {character.faction} | {character.realm}
          </p>
        </div>
      </header>

      <section className="card-stats">
        <p>High priority: {metrics.counts.high}</p>
        <p>Remaining wishlist: {metrics.remaining}</p>
        <p>Locked raids: {metrics.lockedOut}</p>
      </section>

      <section>
        <p className="summary-title">Raid Needs</p>
        <p>{raidSummary}</p>
        {raidItemsByRaid?.length ? (
          <ul className="raid-item-list">
            {raidItemsByRaid.map((raidEntry) => (
              <li key={raidEntry.raidName}>
                <strong>{raidEntry.raidName}:</strong> {raidEntry.items.join(", ")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="raid-item-empty">No wishlist items in currently available raids.</p>
        )}
      </section>

      <section>
        <p className="summary-title">Loot completion</p>
        <ProgressBar value={completion} />
      </section>
    </article>
  );
}

export default CharacterCard;
