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
import warriorSimTemplate from "../data/warriorSimTemplate.json";

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

const DEFAULT_SPEC_BY_CLASS = {
  Paladin: "paladin-holy-p6"
};

const WARRIOR_SIM_EQUIPMENT_ORDER = [1, 2, 3, 15, 5, 9, 10, 6, 7, 8, 11, 12, 13, 14, 16, 17, 18];
const WARRIOR_SIM_RACE_BY_CHARACTER_RACE = {
  Human: "RaceHuman",
  Orc: "RaceOrc",
  Dwarf: "RaceDwarf",
  "Night Elf": "RaceNightElf",
  Undead: "RaceUndead",
  Tauren: "RaceTauren",
  Gnome: "RaceGnome",
  Troll: "RaceTroll"
};

const ITEM_ID_PLACEHOLDER_PATTERN = /^item\s*#\d+$/i;

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
  const itemId = Number(item?.itemId || 0);
  const hasValidId = Number.isFinite(itemId) && itemId > 0;
  const isIdPlaceholder = ITEM_ID_PLACEHOLDER_PATTERN.test(name);

  if (name && !isIdPlaceholder) {
    return name;
  }

  if (hasValidId) {
    return KNOWN_ITEM_NAME_BY_ID.get(itemId) || BIS_ITEM_NAME_BY_ID[itemId] || `Item #${itemId}`;
  }

  return "Empty";
}

function hasMissingItemName(item) {
  const itemId = Number(item?.itemId || 0);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return false;
  }

  const name = String(item?.itemName || "").trim();
  if (!name) {
    return true;
  }

  return ITEM_ID_PLACEHOLDER_PATTERN.test(name);
}

function buildKnownItemNameMap() {
  const known = new Map();

  Object.entries(BIS_ITEM_NAME_BY_ID).forEach(([idText, name]) => {
    const id = Number(idText);
    const safeName = String(name || "").trim();
    if (Number.isFinite(id) && id > 0 && safeName) {
      known.set(id, safeName);
    }
  });

  Object.values(BIS_ITEM_IDS_BY_SPEC).forEach((slots) => {
    if (!slots || typeof slots !== "object") {
      return;
    }

    Object.values(slots).forEach((entries) => {
      if (!Array.isArray(entries)) {
        return;
      }

      entries.forEach((entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }

        const id = Number(entry.itemId);
        const safeName = String(entry.itemName || "").trim();
        if (Number.isFinite(id) && id > 0 && safeName && !known.has(id)) {
          known.set(id, safeName);
        }
      });
    });
  });

  return known;
}

const KNOWN_ITEM_NAME_BY_ID = buildKnownItemNameMap();

function getBisItemNameById(itemId) {
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) {
    return "Unknown Item";
  }
  return KNOWN_ITEM_NAME_BY_ID.get(id) || BIS_ITEM_NAME_BY_ID[id] || `Item #${id}`;
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

function getBisTierLabel(index) {
  if (index === 0) {
    return "Best";
  }
  if (index === 1) {
    return "Better";
  }
  if (index === 2) {
    return "Good";
  }
  return `Alt ${index + 1}`;
}

function buildWowheadItemUrl(itemId) {
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) {
    return "";
  }
  return `https://www.wowhead.com/classic/item=${id}`;
}

function buildWarriorSimExport(character, equippedBySlot) {
  const next = JSON.parse(JSON.stringify(warriorSimTemplate));
  const templateItems = Array.isArray(next?.player?.equipment?.items)
    ? next.player.equipment.items
    : [];

  const missingSlots = [];
  const items = WARRIOR_SIM_EQUIPMENT_ORDER.map((slot, index) => {
    const equipped = equippedBySlot.get(slot);
    const equippedId = Number(equipped?.itemId || 0);

    if (Number.isFinite(equippedId) && equippedId > 0) {
      return { id: equippedId };
    }

    missingSlots.push(slot);
    const fallbackId = Number(templateItems[index]?.id || 0);
    return fallbackId > 0 ? { id: fallbackId } : { id: 0 };
  });

  if (!next.player || !next.player.equipment) {
    throw new Error("Warrior simulator template is missing equipment data.");
  }

  next.player.equipment.items = items;
  if (character?.name) {
    next.player.name = String(character.name);
  }

  const mappedRace = WARRIOR_SIM_RACE_BY_CHARACTER_RACE[String(character?.race || "").trim()];
  if (mappedRace) {
    next.player.race = mappedRace;
  }

  return {
    jsonText: JSON.stringify(next, null, 2),
    missingSlots
  };
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
  const [isResolvingItemNames, setIsResolvingItemNames] = useState(false);
  const [resolveItemNamesMessage, setResolveItemNamesMessage] = useState("");
  const [warriorExportMessage, setWarriorExportMessage] = useState("");

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

  const isSelectedCharacterWarrior = normalize(selectedCharacter?.class) === "warrior";

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

    const classDefault = DEFAULT_SPEC_BY_CLASS[selectedCharacter.class];
    if (classDefault && selectedSpecOptions.some((option) => option.key === classDefault)) {
      setSelectedSpecKey(classDefault);
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
      const rankedBisItems = normalizedBisItems.map((item, index) => ({
        ...item,
        tier: getBisTierLabel(index),
        index
      }));

      const equippedId = Number(equipped?.itemId || 0);
      const primaryBisId = normalizedBisIds[0] || 0;
      const isBis = equippedId > 0 && primaryBisId > 0 && equippedId === primaryBisId;
      const isAltOption = !isBis && equippedId > 0 && normalizedBisIds.slice(1).includes(equippedId);
      const equippedRankIndex = normalizedBisIds.indexOf(equippedId);
      const equippedTier = equippedRankIndex >= 0 ? getBisTierLabel(equippedRankIndex) : "Not ranked";
      const recommendedItems = isBis
        ? []
        : equippedRankIndex >= 0
          ? rankedBisItems.slice(0, equippedRankIndex)
          : rankedBisItems;

      rows.push({
        slot,
        slotName: SLOT_LABELS[slot] || `Slot ${slot}`,
        equipped,
        bisItemIds: normalizedBisIds,
        bisItems: rankedBisItems,
        recommendedItems,
        equippedTier,
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

  const onResolveMissingItemNames = async () => {
    if (!selectedCharacter?.id || isResolvingItemNames) {
      return;
    }

    const equippedItems = Array.isArray(selectedCharacter.equippedItems)
      ? selectedCharacter.equippedItems
      : [];

    const missingIds = Array.from(new Set(
      equippedItems
        .filter((item) => hasMissingItemName(item))
        .map((item) => Number(item.itemId))
        .filter((id) => Number.isFinite(id) && id > 0)
    ));

    if (!missingIds.length) {
      setResolveItemNamesMessage("No missing equipped item names found for this character.");
      return;
    }

    setIsResolvingItemNames(true);
    setResolveItemNamesMessage(`Fetching ${missingIds.length} missing item name(s)...`);

    try {
      const resolvedNameById = new Map();

      for (const id of missingIds) {
        const knownName = KNOWN_ITEM_NAME_BY_ID.get(id) || BIS_ITEM_NAME_BY_ID[id];
        if (knownName) {
          resolvedNameById.set(id, knownName);
        }
      }

      const nextEquippedItems = equippedItems.map((item) => {
        if (!hasMissingItemName(item)) {
          return item;
        }

        const id = Number(item.itemId || 0);
        const resolvedName = resolvedNameById.get(id);
        if (!resolvedName) {
          return item;
        }

        return {
          ...item,
          itemName: resolvedName
        };
      });

      const fixedCount = nextEquippedItems.reduce((count, item, index) => {
        const prevName = String(equippedItems[index]?.itemName || "").trim();
        const nextName = String(item?.itemName || "").trim();
        return prevName !== nextName ? count + 1 : count;
      }, 0);

      if (!fixedCount) {
        setResolveItemNamesMessage(
          `Could not resolve ${missingIds.length} missing item name(s) from local data yet. Sync DataStore files again or add IDs to bisItemNames.`
        );
        return;
      }

      await updateCharacter(selectedCharacter.id, {
        equippedItems: nextEquippedItems
      });

      setResolveItemNamesMessage(`Updated ${fixedCount} equipped item name(s).`);
    } catch {
      setResolveItemNamesMessage("Failed to fetch missing item names. Please try again.");
    } finally {
      setIsResolvingItemNames(false);
    }
  };

  const onCopyWarriorSimExport = async () => {
    if (!selectedCharacter || !isSelectedCharacterWarrior) {
      return;
    }

    if (!navigator?.clipboard?.writeText) {
      setWarriorExportMessage("Clipboard access is unavailable in this browser context.");
      return;
    }

    try {
      const { jsonText, missingSlots } = buildWarriorSimExport(selectedCharacter, selectedEquipmentBySlot);
      await navigator.clipboard.writeText(jsonText);

      if (missingSlots.length) {
        const missingSlotLabels = missingSlots
          .map((slot) => SLOT_LABELS[slot] || `Slot ${slot}`)
          .join(", ");
        setWarriorExportMessage(
          `Copied Warrior sim JSON. Missing worn items for: ${missingSlotLabels}. Used template fallback IDs for those slots.`
        );
        return;
      }

      setWarriorExportMessage("Copied Warrior sim JSON with your currently equipped item IDs.");
    } catch {
      setWarriorExportMessage("Failed to generate or copy Warrior sim JSON. Please try again.");
    }
  };

  useEffect(() => {
    setWarriorExportMessage("");
  }, [selectedCharacterId]);

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
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={onResolveMissingItemNames}
                  disabled={isResolvingItemNames || !selectedCharacter}
                >
                  {isResolvingItemNames ? "Fetching item names..." : "Fetch missing item names"}
                </button>
                {isSelectedCharacterWarrior ? (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={onCopyWarriorSimExport}
                    disabled={!selectedCharacter}
                  >
                    Copy Warrior Sim JSON
                  </button>
                ) : null}
              </div>

              {resolveItemNamesMessage ? <p className="subtitle">{resolveItemNamesMessage}</p> : null}
              {warriorExportMessage ? <p className="subtitle">{warriorExportMessage}</p> : null}

              {showBisUpgrades ? (
                selectedBisBySlot ? (
                  <ul className="simple-list bis-upgrade-list">
                    {bisUpgradeRows.map((row) => {
                      const topBisItems = row.recommendedItems;
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
                              ? "BiS (Best)"
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
                                        {` (${item.tier})`}
                                      </span>
                                    ))}
                                    {row.isAltOption ? ` (equipped: ${row.equippedTier})` : ""}
                                  </span>
                                )
                                : row.isAltOption
                                  ? `No better recommendation (equipped: ${row.equippedTier})`
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
