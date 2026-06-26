import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useUserCollections } from "../hooks/useUserCollections";
import { updateCharacter } from "../services/dataService";
import { getClassIcon } from "../utils/classIcons";
import { getCharacterBuffSet } from "../utils/buffCatalog";
import {
  BIS_GUIDE_URL_BY_SPEC,
  BIS_ITEM_IDS_BY_SPEC,
  SPEC_OPTIONS_BY_CLASS
} from "../data/bisLists";
import { BIS_ITEM_NAME_BY_ID } from "../data/bisItemNames";

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

function getBisItemNameById(itemId) {
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) {
    return "Unknown Item";
  }
  return BIS_ITEM_NAME_BY_ID[id] || `Item #${id}`;
}

function normalizeBisItems(bisEntry) {
  if (!Array.isArray(bisEntry)) {
    return [];
  }

  return bisEntry
    .map((entry) => {
      if (typeof entry === "number" || typeof entry === "string") {
        const itemId = Number(entry);
        if (!Number.isFinite(itemId) || itemId <= 0) {
          return null;
        }
        return { itemId, name: getBisItemNameById(itemId) };
      }

      if (entry && typeof entry === "object") {
        const itemId = Number(entry.itemId);
        if (!Number.isFinite(itemId) || itemId <= 0) {
          return null;
        }
        const explicitName = String(entry.itemName || "").trim();
        return {
          itemId,
          name: explicitName || getBisItemNameById(itemId)
        };
      }

      return null;
    })
    .filter(Boolean);
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
  const [showBisUpgrades, setShowBisUpgrades] = useState(false);
  const [selectedSpecKey, setSelectedSpecKey] = useState("");

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

  const selectedSpecOptions = useMemo(() => {
    if (!selectedCharacter?.class) {
      return [];
    }
    return SPEC_OPTIONS_BY_CLASS[selectedCharacter.class] || [];
  }, [selectedCharacter]);

  useEffect(() => {
    if (!selectedCharacter) {
      setSelectedSpecKey("");
      return;
    }

    const currentSpec = String(selectedCharacter.bisSpec || "");
    if (currentSpec && selectedSpecOptions.some((option) => option.key === currentSpec)) {
      setSelectedSpecKey(currentSpec);
      return;
    }

    setSelectedSpecKey(selectedSpecOptions[0]?.key || "");
  }, [selectedCharacter, selectedSpecOptions]);

  const selectedGuideUrl = useMemo(
    () => BIS_GUIDE_URL_BY_SPEC[selectedSpecKey] || "",
    [selectedSpecKey]
  );

  const selectedBisBySlot = useMemo(
    () => BIS_ITEM_IDS_BY_SPEC[selectedSpecKey] || null,
    [selectedSpecKey]
  );

  const bisUpgradeRows = useMemo(() => {
    if (!selectedBisBySlot) {
      return [];
    }

    const rows = [];
    Object.entries(selectedBisBySlot).forEach(([slotText, bisItemIds]) => {
      const slot = Number(slotText);
      const equipped = selectedEquipmentBySlot.get(slot) || null;
      const normalizedBisItems = normalizeBisItems(bisItemIds);
      const normalizedBisIds = normalizedBisItems.map((item) => item.itemId);

      const equippedId = Number(equipped?.itemId || 0);
      const primaryBisId = normalizedBisIds[0] || 0;
      const isBis = equippedId > 0 && primaryBisId > 0 && equippedId === primaryBisId;
      const isAltOption = !isBis && equippedId > 0 && normalizedBisIds.slice(1).includes(equippedId);

      rows.push({
        slot,
        slotName: SLOT_LABELS[slot] || `Slot ${slot}`,
        equipped,
        bisItemIds: normalizedBisIds,
        bisItems: normalizedBisItems,
        isAltOption,
        status: isBis ? "bis" : equipped ? "upgrade" : "missing"
      });
    });

    return rows.sort((a, b) => a.slot - b.slot);
  }, [selectedBisBySlot, selectedEquipmentBySlot]);

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

  const onBisSpecChange = async (nextSpec) => {
    setSelectedSpecKey(nextSpec);
    if (!selectedCharacter?.id) {
      return;
    }

    try {
      await updateCharacter(selectedCharacter.id, { bisSpec: nextSpec });
    } catch {
      // Keep UI responsive even if save fails; sync will retry later.
    }
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

            <section className="panel bis-control-panel">
              <div className="row-actions bis-controls-row">
                <label className="saved-toggle">
                  <input
                    type="checkbox"
                    checked={showBisUpgrades}
                    onChange={(event) => setShowBisUpgrades(event.target.checked)}
                  />
                  Show BiS upgrades
                </label>
                <select
                  value={selectedSpecKey}
                  onChange={(event) => onBisSpecChange(event.target.value)}
                  disabled={!selectedSpecOptions.length}
                >
                  {selectedSpecOptions.length ? (
                    selectedSpecOptions.map((option) => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))
                  ) : (
                    <option value="">No spec profile for this class</option>
                  )}
                </select>
                {selectedGuideUrl ? (
                  <a href={selectedGuideUrl} target="_blank" rel="noreferrer" className="secondary-btn bis-guide-link">
                    Source Guide
                  </a>
                ) : null}
              </div>

              {showBisUpgrades ? (
                selectedBisBySlot ? (
                  <ul className="simple-list bis-upgrade-list">
                    {bisUpgradeRows.map((row) => {
                      const topBisItems = row.bisItems.slice(0, 3);
                      return (
                        <li key={row.slot} className={`bis-upgrade-item ${row.status}`}>
                          <span>
                            <strong>{row.slotName}</strong>
                            {": "}
                            {row.equipped ? (
                              <a
                                href={buildWowheadItemUrl(row.equipped.itemId)}
                                target="_blank"
                                rel="noreferrer"
                                data-wowhead={`item=${row.equipped.itemId}`}
                              >
                                {getItemName(row.equipped)}
                              </a>
                            ) : (
                              "Empty"
                            )}
                          </span>
                          <span>
                            {row.status === "bis"
                              ? "BiS"
                              : topBisItems.length
                                ? (
                                  <span className="bis-item-options">
                                    {topBisItems.map((item, index) => (
                                      <span key={item.itemId}>
                                        {index ? ", " : ""}
                                        <a
                                          href={buildWowheadItemUrl(item.itemId)}
                                          target="_blank"
                                          rel="noreferrer"
                                          data-wowhead={`item=${item.itemId}`}
                                        >
                                          {item.name}
                                        </a>
                                      </span>
                                    ))}
                                    {row.bisItems.length > topBisItems.length ? " + more" : ""}
                                    {row.isAltOption ? " (alt equipped)" : ""}
                                  </span>
                                )
                                : "No recommendation"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="subtitle">BiS mapping for this spec is not populated yet. Guide link is ready for curation.</p>
                )
              ) : null}
            </section>

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
