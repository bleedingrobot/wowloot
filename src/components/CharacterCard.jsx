import { FALLBACK_ICON } from "../utils/classIcons";

function CharacterCard({
  character,
  metrics,
  raidSummary,
  lockedRaidSummary,
  raidItemsByRaid,
  classIcon,
  savingKey,
  onToggleRaidSaved
}) {

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
        <p>Remaining wishlist: {metrics.remaining}</p>
        <p>Locked raids: {metrics.lockedOut}</p>
      </section>

      <section>
        <p className="summary-title">Locked Raid List</p>
        <p>{lockedRaidSummary}</p>
      </section>

      <section>
        <p className="summary-title">Raid Needs</p>
        <p>{raidSummary}</p>
        {raidItemsByRaid?.length ? (
          <ul className="raid-item-list">
            {raidItemsByRaid.map((raidEntry) => (
              <li key={raidEntry.raidName}>
                <div>
                  <strong>{raidEntry.raidShort}:</strong> {raidEntry.items.join(", ")}
                </div>
                <label className="saved-toggle">
                  <input
                    type="checkbox"
                    checked={raidEntry.locked}
                    disabled={savingKey === `${character.id}-${raidEntry.raidName}`}
                    onChange={(event) =>
                      onToggleRaidSaved(character.id, raidEntry.raidName, event.target.checked)
                    }
                  />
                  Saved
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="raid-item-empty">No wishlist items in currently available raids.</p>
        )}
      </section>
    </article>
  );
}

export default CharacterCard;
