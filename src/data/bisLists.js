export const SPEC_OPTIONS_BY_CLASS = {
  Druid: [
    { key: "druid-balance-p6", label: "Balance (Phase 6)" },
    { key: "druid-feral-dps-p6", label: "Feral DPS (Phase 6)" },
    { key: "druid-resto-p6", label: "Restoration (Phase 6)" }
  ],
  Hunter: [
    { key: "hunter-dps-p6", label: "DPS (Phase 6)" }
  ],
  Mage: [
    { key: "mage-dps-p6", label: "DPS (Phase 6)" }
  ],
  Paladin: [
    { key: "paladin-retribution-p6", label: "DPS (Phase 6)" },
    { key: "paladin-holy-p6", label: "Holy (Phase 6)" }
  ],
  Priest: [
    { key: "priest-shadow-p6", label: "Shadow (Phase 6)" },
    { key: "priest-holy-p6", label: "Holy (Phase 6)" }
  ],
  Rogue: [
    { key: "rogue-dps-p6", label: "DPS (Phase 6)" }
  ],
  Shaman: [
    { key: "shaman-elemental-p6", label: "Elemental (Phase 6)" },
    { key: "shaman-enhancement-p6", label: "Enhancement (Phase 6)" },
    { key: "shaman-resto-p6", label: "Restoration (Phase 6)" }
  ],
  Warlock: [
    { key: "warlock-dps-p6", label: "DPS (Phase 6)" }
  ],
  Warrior: [
    { key: "warrior-fury-p6", label: "Fury (Phase 6)" }
  ]
};

export const BIS_GUIDE_URL_BY_SPEC = {
  "druid-balance-p6": "https://www.wowhead.com/classic/guide/wow-classic-balance-druid-dps-naxxramas-best-in-slot-gear",
  "druid-feral-dps-p6": "https://www.wowhead.com/classic/guide/wow-classic-feral-druid-dps-naxxramas-best-in-slot-gear",
  "druid-resto-p6": "https://www.wowhead.com/classic/guide/wow-classic-druid-healing-naxxramas-best-in-slot-gear",
  "hunter-dps-p6": "https://www.wowhead.com/classic/guide/wow-classic-hunter-dps-naxxramas-best-in-slot-gear",
  "mage-dps-p6": "https://www.wowhead.com/classic/guide/wow-classic-mage-dps-naxxramas-best-in-slot-gear",
  "paladin-retribution-p6": "https://www.wowhead.com/classic/guide/wow-classic-paladin-dps-naxxramas-best-in-slot-gear",
  "paladin-holy-p6": "https://www.wowhead.com/classic/guide/wow-classic-paladin-healing-naxxramas-best-in-slot-gear",
  "priest-shadow-p6": "https://www.wowhead.com/classic/guide/wow-classic-shadow-priest-dps-naxxramas-best-in-slot-gear",
  "priest-holy-p6": "https://www.wowhead.com/classic/guide/wow-classic-priest-healing-naxxramas-best-in-slot-gear",
  "rogue-dps-p6": "https://www.wowhead.com/classic/guide/wow-classic-rogue-dps-naxxramas-best-in-slot-gear",
  "shaman-elemental-p6": "https://www.wowhead.com/classic/guide/wow-classic-elemental-shaman-dps-naxxramas-best-in-slot-gear",
  "shaman-enhancement-p6": "https://www.wowhead.com/classic/guide/wow-classic-enhancement-shaman-dps-naxxramas-best-in-slot-gear",
  "shaman-resto-p6": "https://www.wowhead.com/classic/guide/wow-classic-shaman-healing-naxxramas-best-in-slot-gear",
  "warlock-dps-p6": "https://www.wowhead.com/classic/guide/wow-classic-warlock-dps-naxxramas-best-in-slot-gear",
  "warrior-fury-p6": "https://www.wowhead.com/classic/guide/wow-classic-fury-warrior-dps-naxxramas-best-in-slot-gear"
};

// Slot IDs follow WoW inventory slot numbering used by DataStore_Inventory.
export const BIS_ITEM_IDS_BY_SPEC = {
  "warrior-fury-p6": {
    1: [12640],
    2: [21664],
    3: [21330],
    5: [23226],
    6: [19823],
    7: [22385],
    8: [21490],
    9: [21602],
    10: [21672],
    11: [18821],
    12: [19384],
    13: [11815],
    14: [20130],
    15: [21701],
    16: [21650],
    17: [21244],
    18: [21459]
  }
};
