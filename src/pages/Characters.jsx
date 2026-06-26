import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useUserCollections } from "../hooks/useUserCollections";
import { getClassIcon } from "../utils/classIcons";
import { getCharacterBuffSet } from "../utils/buffCatalog";

const EQUIPMENT_LEFT_SLOTS = [1, 2, 3, 5, 9, 10, 6, 7, 8];
const EQUIPMENT_RIGHT_SLOTS = [11, 12, 13, 14, 15, 16, 17, 18, 19];
const SLOT_LABELS = {
  1: "Head",
  2: "Neck",
  3: "Shoulder",
  4: "Shirt",
  5: "Chest",
  6: "Waist",
  7: "Legs",
  8: "Feet",
  9: "Wrist",
  10: "Hands",
  11: "Finger 1",
  12: "Finger 2",
  13: "Trinket 1",
  14: "Trinket 2",
  15: "Back",
  16: "Main Hand",
  17: "Off Hand",
  18: "Ranged",
  19: "Tabard"
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function formatGold(copperValue) {
  const total = Number(copperValue);
  if (!Number.isFinite(total) || total < 0) {
    return "-";
  }

  const gold = Math.floor(total / 10000);
  const silver = Math.floor((total % 10000) / 100);
  const copper = total % 100;
  return `${gold}g ${silver}s ${copper}c`;
}

function formatHours(secondsValue) {
  const total = Number(secondsValue);
  if (!Number.isFinite(total) || total < 0) {
    return "-";
  }

  const hours = total / 3600;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

function getQualityClass(quality) {
  const value = String(quality || "common").toLowerCase();
  if (["poor", "common", "uncommon", "rare", "epic", "legendary"].includes(value)) {
    return value;
  }
  return "common";
}

function getItemName(item) {
  const name = String(item?.itemName || "").trim();
  return name || (item?.itemId ? `Item #${item.itemId}` : "Empty");
}

function buildWowheadItemUrl(itemId) {
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) {
    return "";
  }
  return `https://www.wowhead.com/classic/item=${id}`;
}

function CharactersPage() {
  const { user } = useAuth();
  const { data } = useUserCollections(user?.uid);
  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [factionFilter, setFactionFilter] = useState("all");
  const [realmFilter, setRealmFilter] = useState("all");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");

  const classOptions = useMemo(
    () => Array.from(new Set(data.characters.map((character) => character.class).filter(Boolean))).sort(),
    [data.characters]
  );
  const factionOptions = useMemo(
    () => Array.from(new Set(data.characters.map((character) => character.faction).filter(Boolean))).sort(),
    [data.characters]
  );
  const realmOptions = useMemo(
    () => Array.from(new Set(data.characters.map((character) => character.realm).filter(Boolean))).sort(),
    [data.characters]
  );

  const filteredCharacters = useMemo(() => {
    return data.characters
      .filter((character) => {
        if (classFilter !== "all" && character.class !== classFilter) {
          return false;
        }
        if (factionFilter !== "all" && character.faction !== factionFilter) {
          return false;
        }
        if (realmFilter !== "all" && character.realm !== realmFilter) {
          return false;
        }

        const search = normalize(searchTerm);
        if (!search) {
          return true;
        }

        return normalize(character.name).includes(search)
          || normalize(character.realm).includes(search)
          || normalize(character.class).includes(search)
          || normalize(character.guildName).includes(search);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.characters, classFilter, factionFilter, realmFilter, searchTerm]);

  useEffect(() => {
    if (!filteredCharacters.length) {
      setSelectedCharacterId("");
      return;
    }

    const stillVisible = filteredCharacters.some((character) => character.id === selectedCharacterId);
    if (!stillVisible) {
      setSelectedCharacterId(filteredCharacters[0].id);
    }
  }, [filteredCharacters, selectedCharacterId]);

  const selectedCharacter = useMemo(
    () => filteredCharacters.find((character) => character.id === selectedCharacterId) || null,
    [filteredCharacters, selectedCharacterId]
  );

  const selectedEquipmentBySlot = useMemo(() => {
    const map = new Map();
    (selectedCharacter?.equippedItems || []).forEach((item) => {
      if (Number.isFinite(item.slot)) {
        map.set(Number(item.slot), item);
      }
    });
    return map;
  }, [selectedCharacter]);

  const selectedLockouts = useMemo(() => {
    if (!selectedCharacter) {
      return [];
    }

    const now = Date.now();
    return data.raidStatuses
      .filter((status) => status.characterId === selectedCharacter.id && status.completed && status.resetDate)
      .filter((status) => {
        const resetAt = Date.parse(status.resetDate);
        return Number.isFinite(resetAt) && resetAt > now;
      })
      .sort((a, b) => Date.parse(a.resetDate) - Date.parse(b.resetDate));
  }, [data.raidStatuses, selectedCharacter]);

  const selectedBuffs = useMemo(() => {
    if (!selectedCharacter) {
      return [];
    }

    return [...getCharacterBuffSet(selectedCharacter)]
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [selectedCharacter]);

  const renderSlot = (slotId) => {
    const item = selectedEquipmentBySlot.get(slotId);
    const slotLabel = SLOT_LABELS[slotId] || `Slot ${slotId}`;

    if (!item) {
      return (
        <li key={slotId} className="character-slot empty">
          <span className="character-slot-label">{slotLabel}</span>
          <span className="character-slot-item">Empty</span>
        </li>
      );
    }

    return (
      <li key={slotId} className={`character-slot ${getQualityClass(item.quality)}`}>
        <span className="character-slot-label">{slotLabel}</span>
        <span className="character-slot-item">
          <a
            href={buildWowheadItemUrl(item.itemId)}
            target="_blank"
            rel="noreferrer"
            data-wowhead={`item=${item.itemId}`}
          >
            {getItemName(item)}
          </a>
        </span>
      </li>
    );
  };

  if (!user) {
    return <p className="empty-panel">Sign in to view character armory details.</p>;
  }

  return (
    <section className="split-grid character-armory-layout">
      <article className="panel character-list-panel">
        <h2>Character Armory</h2>
        <p className="subtitle">Character data is import-driven from Nova + DataStore files.</p>
        <div className="character-filters">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search name, class, realm, guild"
          />
          <select
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
          >
            <option value="all">All classes</option>
            {classOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={factionFilter}
            onChange={(event) => setFactionFilter(event.target.value)}
          >
            <option value="all">All factions</option>
            {factionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={realmFilter}
            onChange={(event) => setRealmFilter(event.target.value)}
          >
            <option value="all">All realms</option>
            {realmOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {filteredCharacters.length ? (
          <ul className="simple-list character-selection-list">
            {filteredCharacters.map((character) => (
              <li
                key={character.id}
                className={`character-selection-item ${selectedCharacterId === character.id ? "selected" : ""}`}
              >
                <button type="button" className="character-select-btn" onClick={() => setSelectedCharacterId(character.id)}>
                  <img src={getClassIcon(character.class)} alt="" className="class-icon" />
                  <span className="character-select-main">
                    <strong>{character.name}</strong>
                    <span>{character.class} • Level {character.level || "?"} • {character.realm}</span>
                    <span>
                      {typeof character.averageItemLevel === "number" ? `Avg iLvl ${character.averageItemLevel.toFixed(1)}` : "No iLvl yet"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-panel">No characters match your current filters.</p>
        )}
      </article>

      <article className="panel character-details-panel">
        {selectedCharacter ? (
          <div className="character-detail-wrap">
            <header className="character-hero">
              <img src={getClassIcon(selectedCharacter.class)} alt="" className="class-icon" />
              <div>
                <h2>{selectedCharacter.name}</h2>
                <p className="subtitle">
                  Level {selectedCharacter.level || "?"} {selectedCharacter.race || "Unknown Race"} {selectedCharacter.class || "Unknown Class"}
                </p>
                <p className="subtitle">
                  {selectedCharacter.faction || "Unknown Faction"} • {selectedCharacter.realm || "Unknown Realm"}
                </p>
              </div>
            </header>

            <section className="panel character-equipment-panel">
              <h3>Equipped Items</h3>
              <div className="character-equipment-grid">
                <ul className="character-slot-column">
                  {EQUIPMENT_LEFT_SLOTS.map((slotId) => renderSlot(slotId))}
                </ul>
                <ul className="character-slot-column">
                  {EQUIPMENT_RIGHT_SLOTS.map((slotId) => renderSlot(slotId))}
                </ul>
              </div>
            </section>

            <section className="split-grid character-summary-grid">
              <article className="panel">
                <h3>Profile</h3>
                <ul className="simple-list compact-list">
                  <li><span>Guild</span><strong>{selectedCharacter.guildName || "-"}</strong></li>
                  <li><span>Rank</span><strong>{selectedCharacter.guildRankName || "-"}</strong></li>
                  <li><span>Zone</span><strong>{selectedCharacter.zone || "-"}</strong></li>
                  <li><span>Subzone</span><strong>{selectedCharacter.subZone || "-"}</strong></li>
                  <li><span>Hearth</span><strong>{selectedCharacter.bindLocation || "-"}</strong></li>
                </ul>
              </article>

              <article className="panel">
                <h3>Progress</h3>
                <ul className="simple-list compact-list">
                  <li><span>Money</span><strong>{formatGold(selectedCharacter.money)}</strong></li>
                  <li><span>Played</span><strong>{formatHours(selectedCharacter.played)}</strong></li>
                  <li><span>This Level</span><strong>{formatHours(selectedCharacter.playedThisLevel)}</strong></li>
                  <li><span>Avg iLvl</span><strong>{typeof selectedCharacter.averageItemLevel === "number" ? selectedCharacter.averageItemLevel.toFixed(1) : "-"}</strong></li>
                  <li><span>Overall iLvl</span><strong>{typeof selectedCharacter.overallItemLevel === "number" ? selectedCharacter.overallItemLevel.toFixed(1) : "-"}</strong></li>
                </ul>
              </article>
            </section>

            <section className="split-grid character-extra-grid">
              <article className="panel">
                <h3>Buff Snapshot</h3>
                {selectedBuffs.length ? (
                  <div className="buff-chip-row">
                    {selectedBuffs.map((buff) => (
                      <span key={buff} className="buff-chip booned">{buff}</span>
                    ))}
                  </div>
                ) : (
                  <p className="subtitle">No synced buff data yet.</p>
                )}
              </article>

              <article className="panel">
                <h3>Active Lockouts</h3>
                {selectedLockouts.length ? (
                  <ul className="simple-list compact-list">
                    {selectedLockouts.map((status) => (
                      <li key={`${status.characterId}-${status.raidName}`}>
                        <span>{status.raidName}</span>
                        <strong>{new Date(status.resetDate).toLocaleString()}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="subtitle">No active lockouts.</p>
                )}
              </article>
            </section>
          </div>
        ) : (
          <p className="empty-panel">Select a character to view armory details.</p>
        )}
      </article>
    </section>
  );
}

export default CharactersPage;
