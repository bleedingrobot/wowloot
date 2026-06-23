import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useUserCollections } from "../hooks/useUserCollections";
import {
  addShoppingProfile,
  deleteShoppingProfile,
  updateShoppingProfile
} from "../services/dataService";

const WOW_CLASSES = [
  "Druid", "Hunter", "Mage", "Paladin", "Priest",
  "Rogue", "Shaman", "Warlock", "Warrior"
];

const EMPTY_PROFILE = {
  name: "",
  className: "Warrior",
  items: []
};

function ShoppingPage() {
  const { user } = useAuth();
  const { data } = useUserCollections(user?.uid);

  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_PROFILE });
  const [newItemName, setNewItemName] = useState("");
  const [newItemQty, setNewItemQty] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const profiles = data.shoppingProfiles;

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) || null,
    [profiles, selectedId]
  );

  useEffect(() => {
    if (selectedProfile) {
      setForm({
        name: selectedProfile.name || "",
        className: selectedProfile.className || "Warrior",
        items: selectedProfile.items || []
      });
    }
  }, [selectedProfile]);

  if (!user) {
    return <p className="empty-panel">Sign in to manage shopping profiles.</p>;
  }

  const onSelectProfile = (id) => {
    setSelectedId(id);
    setMessage("");
  };

  const onNewProfile = () => {
    setSelectedId(null);
    setForm({ ...EMPTY_PROFILE, items: [] });
    setMessage("");
  };

  const onSave = async () => {
    if (!form.name.trim()) {
      setMessage("Profile name is required.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    try {
      if (selectedId) {
        await updateShoppingProfile(selectedId, {
          name: form.name.trim(),
          className: form.className,
          items: form.items
        });
        setMessage("Profile saved.");
      } else {
        const created = await addShoppingProfile(user.uid, {
          name: form.name.trim(),
          className: form.className,
          items: form.items
        });
        setSelectedId(created.id);
        setMessage("Profile created.");
      }
    } catch {
      setMessage("Save failed. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async () => {
    if (!selectedId) {
      return;
    }
    if (!window.confirm(`Delete profile "${selectedProfile?.name}"?`)) {
      return;
    }

    try {
      await deleteShoppingProfile(selectedId);
      setSelectedId(null);
      setForm({ ...EMPTY_PROFILE, items: [] });
      setMessage("Profile deleted.");
    } catch {
      setMessage("Delete failed. Try again.");
    }
  };

  const onAddItem = () => {
    if (!newItemName.trim()) {
      return;
    }

    const qty = Math.max(1, Number(newItemQty) || 1);
    const name = newItemName.trim();
    const exists = form.items.some(
      (item) => item.itemName.toLowerCase() === name.toLowerCase()
    );

    if (exists) {
      setForm((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.itemName.toLowerCase() === name.toLowerCase()
            ? { ...item, quantity: qty }
            : item
        )
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        items: [...prev.items, { itemName: name, quantity: qty }]
      }));
    }

    setNewItemName("");
    setNewItemQty(1);
  };

  const onRemoveItem = (itemName) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.itemName !== itemName)
    }));
  };

  const onUpdateItemQty = (itemName, qty) => {
    const safe = Math.max(1, Number(qty) || 1);
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.itemName === itemName ? { ...item, quantity: safe } : item
      )
    }));
  };

  return (
    <section className="split-grid shopping-page">
      <article className="panel shopping-list-panel">
        <div className="panel-heading">
          <div>
            <h2>Shopping Profiles</h2>
            <p className="subtitle">Define what each class should carry.</p>
          </div>
          <button type="button" onClick={onNewProfile}>
            New Profile
          </button>
        </div>

        <ul className="simple-list">
          {profiles.length ? (
            profiles
              .slice()
              .sort((a, b) => String(a.className).localeCompare(String(b.className)) || String(a.name).localeCompare(String(b.name)))
              .map((profile) => (
                <li
                  key={profile.id}
                  className={`shopping-profile-row${selectedId === profile.id ? " shopping-profile-selected" : ""}`}
                  onClick={() => onSelectProfile(profile.id)}
                >
                  <span>
                    <strong>{profile.name}</strong>
                    <span className="subtitle"> — {profile.className}</span>
                  </span>
                  <span className="text-muted">{(profile.items || []).length} item(s)</span>
                </li>
              ))
          ) : (
            <li>No profiles yet. Click New Profile to create one.</li>
          )}
        </ul>
      </article>

      <article className="panel shopping-editor-panel">
        <div className="panel-heading">
          <div>
            <h2>{selectedId ? "Edit Profile" : "New Profile"}</h2>
          </div>
          <div className="row-actions">
            <button type="button" onClick={onSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </button>
            {selectedId ? (
              <button type="button" className="danger" onClick={onDelete}>
                Delete
              </button>
            ) : null}
          </div>
        </div>

        {message ? <p className="subtitle">{message}</p> : null}

        <div className="stack-form">
          <label>
            <span className="summary-title">Profile Name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. Warrior DPS"
            />
          </label>

          <label>
            <span className="summary-title">Class</span>
            <select
              value={form.className}
              onChange={(event) => setForm((prev) => ({ ...prev, className: event.target.value }))}
            >
              <option value="All">All classes</option>
              {WOW_CLASSES.map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </label>

          <div>
            <p className="summary-title">Required Items</p>
            <div className="shopping-add-item row-actions">
              <input
                value={newItemName}
                onChange={(event) => setNewItemName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && onAddItem()}
                placeholder="Item name, e.g. Elixir of the Mongoose"
              />
              <input
                type="number"
                min="1"
                value={newItemQty}
                onChange={(event) => setNewItemQty(event.target.value)}
                className="shopping-qty-input"
              />
              <button type="button" onClick={onAddItem}>Add</button>
            </div>

            {form.items.length ? (
              <ul className="simple-list shopping-items-list">
                {form.items.map((item) => (
                  <li key={item.itemName}>
                    <span>{item.itemName}</span>
                    <div className="row-actions">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) => onUpdateItemQty(item.itemName, event.target.value)}
                        className="shopping-qty-input"
                      />
                      <button
                        type="button"
                        className="danger"
                        onClick={() => onRemoveItem(item.itemName)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="subtitle">No items yet. Add items above.</p>
            )}
          </div>
        </div>
      </article>
    </section>
  );
}

export default ShoppingPage;
