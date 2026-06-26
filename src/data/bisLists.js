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
  "druid-balance-p6": {
    1: [19375],
    2: [23057],
    3: [22983],
    5: [21838],
    6: [22730],
    7: [19683],
    8: [19684],
    9: [21186],
    10: [21585],
    11: [21709, 23031, 23025, 19403, 21836],
    12: [21709, 23031, 23025, 19403, 21836],
    13: [23207, 19379, 23046, 19950, 19812],
    14: [23207, 19379, 23046, 19950, 19812],
    15: [23050],
    16: [22988, 19360, 22803, 19347]
  },
  "druid-feral-dps-p6": {
    1: [8345],
    2: [19377],
    3: [21665],
    5: [21680],
    6: [21586],
    7: [23071],
    8: [21493],
    9: [21602],
    10: [21672, 9449],
    11: [23038, 21205, 17063],
    12: [23038, 21205, 17063],
    13: [23041, 19406, 23206, 22954],
    14: [23041, 19406, 23206, 22954],
    15: [21701],
    16: [9449, 22632]
  },
  "druid-resto-p6": {
    1: [16900],
    2: [23036],
    3: [16902],
    5: [16897],
    6: [16903],
    7: [16901],
    8: [16898],
    9: [16904],
    10: [16899],
    11: [22939, 19382, 21620, 19140, 19863],
    12: [22939, 19382, 21620, 19140, 19863],
    13: [19955, 23047, 19395, 20636, 19950],
    14: [19955, 23047, 19395, 20636, 19950],
    15: [22960],
    16: [23056, 21839, 22942, 23464, 21523, 22632, 22801, 21275],
    17: [23048, 23029, 21666, 19312, 22329]
  },
  "hunter-dps-p6": {
    1: [22438],
    2: [19377],
    3: [22439],
    5: [22436],
    6: [22442],
    7: [23071],
    8: [22440],
    9: [22443],
    10: [16463],
    11: [23038, 22961, 23067, 21205, 17063],
    12: [23038, 22961, 23067, 21205, 17063],
    13: [23206, 19953, 19406, 22954, 23570],
    14: [23206, 19953, 19406, 22954, 23570],
    15: [21710],
    16: [22802, 23044, 23014, 21244, 22816],
    17: [23242, 22802, 22816, 23044, 23014],
    18: [22812, 19361, 22811, 23557, 18855]
  },
  "mage-dps-p6": {
    1: [22498],
    2: [21608],
    3: [22983],
    5: [22496],
    6: [22730],
    7: [23070],
    8: [22500],
    9: [23021],
    10: [21585],
    11: [23237, 23062, 21709, 23031, 21836],
    12: [23237, 23062, 21709, 23031, 21836],
    13: [19379, 23046, 23207, 19339, 19950],
    14: [19379, 23046, 23207, 19339, 19950],
    15: [23050],
    16: [22807, 22803, 23451, 21622],
    17: [23049, 19311, 21597, 21471, 19366],
    18: [22821, 21603, 19861, 22820]
  },
  "paladin-retribution-p6": {
    1: [21387],
    2: [23053],
    3: [23667],
    5: [23226],
    6: [23219],
    7: [23068],
    8: [21388],
    9: [22936],
    10: [21581],
    11: [23038, 18821, 19432, 21677, 19325],
    12: [23038, 18821, 19432, 21677, 19325],
    13: [19343, 22954, 23206, 11815, 21180],
    14: [19343, 22954, 23206, 11815, 21180],
    15: [21710],
    16: [22798, 22691, 17182, 18876, 21679]
  },
  "paladin-holy-p6": {
    1: [22428],
    2: [21712],
    3: [18810],
    5: [22425],
    6: [19162],
    7: [19385],
    8: [19437],
    9: [21604],
    10: [20264],
    11: [19382, 22939, 21620, 19140, 23066],
    12: [19382, 22939, 21620, 19140, 23066],
    13: [23047, 19395, 21625, 19343, 20636],
    14: [23047, 19395, 21625, 19343, 20636],
    15: [22960],
    16: [23056, 21839, 22942, 23464, 19360],
    17: [22819, 23048, 21666, 23029, 19312]
  },
  "priest-shadow-p6": {
    1: [23035],
    2: [18814],
    3: [22983],
    5: [23220],
    6: [22730],
    7: [19133],
    8: [21600],
    9: [21611],
    10: [21585],
    11: [21709, 23031, 21210, 21190, 19434],
    12: [21709, 23031, 21210, 21190, 19434],
    13: [19379, 23046, 23207, 18820, 19950],
    14: [19379, 23046, 23207, 18820, 19950],
    15: [22731],
    16: [22988, 22803, 19360, 23451, 22799, 22800, 19356, 21273, 18873],
    17: [19309, 23049, 19366, 21597, 21471],
    18: [21603, 22821, 22820, 19861]
  },
  "priest-holy-p6": {
    1: [16921],
    2: [23036],
    3: [16924],
    5: [16923],
    6: [16925],
    7: [16922],
    8: [16919],
    9: [16926],
    10: [16920],
    11: [23061, 22939, 19382, 21620, 19140],
    12: [23061, 22939, 19382, 21620, 19140],
    13: [19958, 23047, 19395, 21625, 20636],
    14: [19958, 23047, 19395, 21625, 20636],
    15: [22960],
    16: [23056, 21839, 22942, 23464, 21523, 22631, 22801, 21275, 18608],
    17: [23048, 23029, 21666, 19312],
    18: [23009, 15283, 15282, 21801, 22254]
  },
  "rogue-dps-p6": {
    1: [22478],
    2: [19377],
    3: [22479],
    5: [21364],
    6: [22482],
    7: [22477],
    8: [22480],
    9: [22483],
    10: [22481],
    11: [23060, 23038, 17063, 22961, 21205],
    12: [23060, 23038, 17063, 22961, 21205],
    13: [22954, 23041, 23206, 23570, 21180],
    14: [22954, 23041, 23206, 23570, 21180],
    15: [21710],
    16: [23054, 12584, 21650, 19352, 20577],
    17: [23014, 23577, 19351, 19019, 22806],
    18: [22812, 21616, 22811, 21459, 17069]
  },
  "shaman-elemental-p6": {
    1: [19375],
    2: [21608],
    3: [23664],
    5: [21838],
    6: [22730],
    7: [23070],
    8: [21600],
    9: [21186],
    10: [21585],
    11: [21709, 23031, 23025, 19403, 21190],
    12: [21709, 23031, 23025, 19403, 21190],
    13: [19344, 23207, 23046, 19379],
    14: [19344, 23207, 23046, 19379],
    15: [23050],
    16: [22988, 19360, 22803, 23466],
    17: [23049, 21597, 19891]
  },
  "shaman-enhancement-p6": {
    1: [18817],
    2: [23053],
    3: [21665],
    5: [23226],
    6: [21586],
    7: [23071],
    8: [19381],
    9: [21602],
    10: [21672],
    11: [23038, 21677, 18821, 19325, 19384],
    12: [23038, 21677, 18821, 19325, 19384],
    13: [23041, 22954, 19406, 11815],
    14: [23041, 22954, 19406, 11815],
    15: [23045],
    16: [22798, 21134, 18831, 22815, 17182]
  },
  "shaman-resto-p6": {
    1: [22466],
    2: [21712],
    3: [22467],
    5: [22464],
    6: [21582],
    7: [22465],
    8: [16949],
    9: [16943],
    10: [16948, 22819],
    11: [21620, 23065, 19382, 22939, 19140],
    12: [21620, 23065, 19382, 22939, 19140],
    13: [23047, 19395, 20636, 19344, 19950],
    14: [23047, 19395, 20636, 19344, 19950],
    15: [21583],
    16: [23056, 21839, 22942, 23464, 19360, 22801, 21275],
    17: [22819, 23048, 21666, 23029, 19312],
    18: [22396]
  },
  "warlock-dps-p6": {
    1: [22506],
    2: [23057],
    3: [22507],
    5: [22504],
    6: [22730],
    7: [23070],
    8: [22508],
    9: [19374],
    10: [21585],
    11: [21709, 23031, 23025, 19403, 21417],
    12: [21709, 23031, 23025, 19403, 21417],
    13: [23207, 23046, 19379, 18820, 21473],
    14: [23207, 23046, 19379, 18820, 21473],
    15: [23050],
    16: [22807, 22803, 23466, 21622, 17103, 22630, 22800, 22799, 21273, 19356],
    17: [23049, 21597, 19891, 22329, 19366],
    18: [22820, 22821, 21603, 19861, 13396]
  },
  "warrior-fury-p6": {
    1: [{ itemId: 19372, itemName: "Helm of Endless Rage" }],
    2: [{ itemId: 23053, itemName: "Stormrage's Talisman of Seething" }],
    3: [{ itemId: 21330, itemName: "Conqueror's Spaulders" }],
    5: [{ itemId: 23000, itemName: "Plated Abomination Ribcage" }],
    6: [{ itemId: 23219, itemName: "Girdle of the Mentor" }],
    7: [{ itemId: 23068, itemName: "Legplates of Carnage" }],
    8: [{ itemId: 19387, itemName: "Chromatic Boots" }],
    9: [{ itemId: 22936, itemName: "Wristguards of Vengeance" }],
    10: [{ itemId: 21581, itemName: "Gauntlets of Annihilation" }],
    11: [
      { itemId: 23038, itemName: "Band of Unnatural Forces" },
      { itemId: 18821, itemName: "Quick Strike Ring" },
      { itemId: 21677, itemName: "Ring of the Qiraji Fury" },
      { itemId: 19432, itemName: "Circle of Applied Force" },
      { itemId: 19384, itemName: "Master Dragonslayer's Ring" }
    ],
    12: [
      { itemId: 18821, itemName: "Quick Strike Ring" },
      { itemId: 23038, itemName: "Band of Unnatural Forces" },
      { itemId: 21677, itemName: "Ring of the Qiraji Fury" },
      { itemId: 19432, itemName: "Circle of Applied Force" },
      { itemId: 19384, itemName: "Master Dragonslayer's Ring" }
    ],
    13: [
      { itemId: 22954, itemName: "Kiss of the Spider" },
      { itemId: 23206, itemName: "Mark of the Champion" },
      { itemId: 23041, itemName: "Slayer's Crest" },
      { itemId: 20130, itemName: "Diamond Flask" },
      { itemId: 23570, itemName: "Jom Gabbar" }
    ],
    14: [
      { itemId: 23206, itemName: "Mark of the Champion" },
      { itemId: 22954, itemName: "Kiss of the Spider" },
      { itemId: 23041, itemName: "Slayer's Crest" },
      { itemId: 20130, itemName: "Diamond Flask" },
      { itemId: 23570, itemName: "Jom Gabbar" }
    ],
    15: [
      { itemId: 23045, itemName: "Shroud of Dominion" },
      { itemId: 21701, itemName: "Cloak of Concentrated Hatred" }
    ],
    16: [
      { itemId: 23054, itemName: "Gressil, Dawn of Ruin" },
      { itemId: 23577, itemName: "The Hungering Cold" },
      { itemId: 22808, itemName: "The Castigator" },
      { itemId: 17112, itemName: "Empyrean Demolisher" },
      { itemId: 23221, itemName: "Misplaced Servo Arm" }
    ],
    17: [
      { itemId: 23577, itemName: "The Hungering Cold" },
      { itemId: 22808, itemName: "The Castigator" },
      { itemId: 23014, itemName: "Iblis, Blade of the Fallen Seraph" },
      { itemId: 23456, itemName: "Grand Marshal's Swiftblade" },
      { itemId: 19352, itemName: "Chromatically Tempered Sword" }
    ],
    18: [
      { itemId: 22812, itemName: "Nerubian Slavemaker" },
      { itemId: 22811, itemName: "Soulstring" },
      { itemId: 23557, itemName: "Larvae of the Great Worm" },
      { itemId: 21459, itemName: "Crossbow of Imminent Doom" },
      { itemId: 17069, itemName: "Striker's Mark" }
    ]
  }
};
