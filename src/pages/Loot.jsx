import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { RAIDS } from "../data/raids";
import { useUserCollections } from "../hooks/useUserCollections";
import { addLootItem, deleteLootItem, updateLootItem } from "../services/dataService";

function LootPage() {
  const { user } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const accountNameById = new Map(data.accounts.map((account) => [account.id, account.battleNetId]));
  const visibleCharacters = data.characters.filter((character) => character.showOnDashboard !== false);
  const visibleCharacterIds = new Set(visibleCharacters.map((character) => character.id));

  const [form, setForm] = useState({
    characterId: "",
    itemName: "",
    raidName: RAIDS[0].name,
    priority: "high",
    iconUrl: ""
  });

  if (!user) {
    return <p className="empty-panel">Sign in to edit loot wishlists.</p>;
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.characterId || !form.itemName.trim()) {
      return;
    }

    await addLootItem(user.uid, {
      characterId: form.characterId,
      itemName: form.itemName.trim(),
      raidName: form.raidName,
      priority: form.priority,
      iconUrl: form.iconUrl.trim(),
      obtained: false
    });

    setForm((prev) => ({ ...prev, itemName: "", iconUrl: "" }));
  };

  const formatCharacterLabel = (character) => {
    const accountName = character.accountId
      ? accountNameById.get(character.accountId) || "Unknown account"
      : "Unassigned";
    return `${character.name} | ${character.realm || "Unknown realm"} | ${accountName}`;
  };

  return (
    <section className="split-grid">
      <article className="panel">
        <h2>Add Loot Need</h2>
        <form onSubmit={onSubmit} className="stack-form">
          <select
            value={form.characterId}
            onChange={(event) => setForm((prev) => ({ ...prev, characterId: event.target.value }))}
          >
            <option value="">Select character</option>
            {visibleCharacters.map((character) => (
              <option key={character.id} value={character.id}>
                {formatCharacterLabel(character)}
              </option>
            ))}
          </select>

          <input
            value={form.itemName}
            onChange={(event) => setForm((prev) => ({ ...prev, itemName: event.target.value }))}
            placeholder="Item name"
          />

          <select
            value={form.raidName}
            onChange={(event) => setForm((prev) => ({ ...prev, raidName: event.target.value }))}
          >
            {RAIDS.map((raid) => (
              <option key={raid.name} value={raid.name}>
                {raid.name}
              </option>
            ))}
          </select>

          <select
            value={form.priority}
            onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <input
            value={form.iconUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, iconUrl: event.target.value }))}
            placeholder="Optional item icon URL"
          />

          <button type="submit">Add Loot Item</button>
        </form>
      </article>

      <article className="panel">
        <h2>Loot Wishlist</h2>
        <ul className="loot-list">
          {data.lootItems
            .filter((item) => visibleCharacterIds.has(item.characterId))
            .map((item) => {
            const owner = data.characters.find((character) => character.id === item.characterId);
            return (
              <li key={item.id}>
                <div>
                  <strong>{item.itemName}</strong>
                  <p>
                    {owner?.name || "Unknown"} | {item.raidName} | {item.priority}
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    onClick={() =>
                      updateLootItem(item.id, {
                        obtained: !item.obtained
                      })
                    }
                  >
                    {item.obtained ? "Mark Needed" : "Mark Obtained"}
                  </button>
                  <button type="button" className="danger" onClick={() => deleteLootItem(item.id)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </article>
    </section>
  );
}

export default LootPage;
