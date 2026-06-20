import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useUserCollections } from "../hooks/useUserCollections";
import { addAccount, addCharacter, deleteCharacter } from "../services/dataService";

const classes = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];

function CharactersPage() {
  const { user } = useAuth();
  const { data } = useUserCollections(user?.uid);

  const [accountInput, setAccountInput] = useState("");
  const [form, setForm] = useState({
    name: "",
    class: "Warrior",
    faction: "Alliance",
    realm: "",
    accountId: "",
    avatarUrl: ""
  });

  if (!user) {
    return <p className="empty-panel">Sign in to manage characters.</p>;
  }

  const onAddAccount = async (event) => {
    event.preventDefault();
    if (!accountInput.trim()) {
      return;
    }
    await addAccount(user.uid, accountInput.trim());
    setAccountInput("");
  };

  const onAddCharacter = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.realm.trim() || !form.accountId) {
      return;
    }

    await addCharacter(user.uid, {
      name: form.name.trim(),
      class: form.class,
      faction: form.faction,
      realm: form.realm.trim(),
      accountId: form.accountId,
      avatarUrl: form.avatarUrl.trim()
    });

    setForm((prev) => ({ ...prev, name: "", realm: "", avatarUrl: "" }));
  };

  return (
    <section className="split-grid">
      <article className="panel">
        <h2>Battle.net Accounts</h2>
        <form onSubmit={onAddAccount} className="stack-form">
          <input
            value={accountInput}
            onChange={(event) => setAccountInput(event.target.value)}
            placeholder="Battle.net tag (example: Lootlord#1234)"
          />
          <button type="submit">Add Account</button>
        </form>

        <ul className="simple-list">
          {data.accounts.map((account) => (
            <li key={account.id}>{account.battleNetId}</li>
          ))}
        </ul>
      </article>

      <article className="panel">
        <h2>Add Character</h2>
        <form onSubmit={onAddCharacter} className="stack-form">
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Character name"
          />

          <select
            value={form.class}
            onChange={(event) => setForm((prev) => ({ ...prev, class: event.target.value }))}
          >
            {classes.map((currentClass) => (
              <option key={currentClass} value={currentClass}>
                {currentClass}
              </option>
            ))}
          </select>

          <select
            value={form.faction}
            onChange={(event) => setForm((prev) => ({ ...prev, faction: event.target.value }))}
          >
            <option value="Alliance">Alliance</option>
            <option value="Horde">Horde</option>
          </select>

          <input
            value={form.realm}
            onChange={(event) => setForm((prev) => ({ ...prev, realm: event.target.value }))}
            placeholder="Realm"
          />

          <select
            value={form.accountId}
            onChange={(event) => setForm((prev) => ({ ...prev, accountId: event.target.value }))}
          >
            <option value="">Select account</option>
            {data.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.battleNetId}
              </option>
            ))}
          </select>

          <input
            value={form.avatarUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, avatarUrl: event.target.value }))}
            placeholder="Optional avatar URL"
          />

          <button type="submit">Add Character</button>
        </form>

        <ul className="simple-list">
          {data.characters.map((character) => (
            <li key={character.id}>
              <span>
                {character.name} ({character.class}) - {character.realm}
              </span>
              <button
                type="button"
                className="danger"
                onClick={() => deleteCharacter(character.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

export default CharactersPage;
