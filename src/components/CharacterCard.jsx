import { FALLBACK_ICON } from "../utils/classIcons";

function CharacterCard({
  character,
  remainingLootCount,
  lockedRaidCount,
  raidSummary,
  lockedRaidSummary,
  raidItemsByRaid,
  classIcon,
  shoppingNeeds
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
        <p>Remaining wishlist: {remainingLootCount}</p>
        <p>Locked raids: {lockedRaidCount}</p>
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
              </li>
            ))}
          </ul>
        ) : (
          <p className="raid-item-empty">No wishlist items in currently available raids.</p>
        )}
      </section>

      {shoppingNeeds?.length ? (
        <section>
          <p className="summary-title shopping-needs-title">Shopping List</p>
          <ul className="raid-item-list shopping-needs-list">
            {shoppingNeeds.map((need) => (
              <li key={need.itemName} className="shopping-need-row">
                <span>{need.itemName}</span>
                <span className="shopping-need-badge">
                  {need.have}/{need.required}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

export default CharacterCard;
