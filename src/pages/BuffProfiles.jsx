import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useUserCollections } from "../hooks/useUserCollections";
import {
  addBuffProfile,
  deleteBuffProfile,
  updateBuffProfile
} from "../services/dataService";
import { AVAILABLE_WORLD_BUFFS } from "../utils/buffCatalog";

const WOW_CLASSES = [
  "Druid", "Hunter", "Mage", "Paladin", "Priest",
  "Rogue", "Shaman", "Warlock", "Warrior"
];

const EMPTY_PROFILE = {
  name: "",
  className: "All",
  buffs: []
};

function BuffProfilesPage() {
  const { user } = useAuth();
  const { data } = useUserCollections(user?.uid);

  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_PROFILE });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const profiles = data.buffProfiles;

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) || null,
    [profiles, selectedId]
  );

  useEffect(() => {
    if (selectedProfile) {
      setForm({
        name: selectedProfile.name || "",
        className: selectedProfile.className || "All",
        buffs: Array.isArray(selectedProfile.buffs) ? selectedProfile.buffs : []
      });
    }
  }, [selectedProfile]);

  if (!user) {
    return <p className="empty-panel">Sign in to manage buff profiles.</p>;
  }

  const onSelectProfile = (id) => {
    setSelectedId(id);
    setMessage("");
  };

  const onNewProfile = () => {
    setSelectedId(null);
    setForm({ ...EMPTY_PROFILE });
    setMessage("");
  };

  const onToggleBuff = (buffName, checked) => {
    setForm((prev) => {
      if (checked) {
        return {
          ...prev,
          buffs: [...new Set([...prev.buffs, buffName])]
        };
      }

      return {
        ...prev,
        buffs: prev.buffs.filter((buff) => buff !== buffName)
      };
    });
  };

  const onSave = async () => {
    if (!form.name.trim()) {
      setMessage("Profile name is required.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    const payload = {
      name: form.name.trim(),
      className: form.className,
      buffs: [...new Set(form.buffs)].sort((a, b) => a.localeCompare(b))
    };

    try {
      if (selectedId) {
        await updateBuffProfile(selectedId, payload);
        setMessage("Profile saved.");
      } else {
        const created = await addBuffProfile(user.uid, payload);
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

    if (!window.confirm(`Delete profile \"${selectedProfile?.name}\"?`)) {
      return;
    }

    try {
      await deleteBuffProfile(selectedId);
      setSelectedId(null);
      setForm({ ...EMPTY_PROFILE });
      setMessage("Profile deleted.");
    } catch {
      setMessage("Delete failed. Try again.");
    }
  };

  return (
    <section className="split-grid shopping-page">
      <article className="panel shopping-list-panel">
        <div className="panel-heading">
          <div>
            <h2>Buff Profiles</h2>
            <p className="subtitle">Choose required world buffs by class with a simple checklist.</p>
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
                    <span className="subtitle"> - {profile.className}</span>
                  </span>
                  <span className="text-muted">{(profile.buffs || []).length} buff(s)</span>
                </li>
              ))
          ) : (
            <li>No buff profiles yet. Click New Profile to create one.</li>
          )}
        </ul>
      </article>

      <article className="panel shopping-editor-panel">
        <div className="panel-heading">
          <div>
            <h2>{selectedId ? "Edit Buff Profile" : "New Buff Profile"}</h2>
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
              placeholder="e.g. Rogue Raid Buffs"
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
            <p className="summary-title">Required Buffs</p>
            <div className="buff-checklist-grid">
              {AVAILABLE_WORLD_BUFFS.map((buff) => (
                <label key={buff} className="buff-check-item">
                  <input
                    type="checkbox"
                    checked={form.buffs.includes(buff)}
                    onChange={(event) => onToggleBuff(buff, event.target.checked)}
                  />
                  <span>{buff}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

export default BuffProfilesPage;
