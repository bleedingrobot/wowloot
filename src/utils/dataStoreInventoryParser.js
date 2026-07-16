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

const QUALITY_BY_COLOR = {
  "9d9d9d": "poor",
  "ffffff": "common",
  "1eff00": "uncommon",
  "0070dd": "rare",
  "a335ee": "epic",
  "ff8000": "legendary"
};

function parseCharacterKey(key) {
  const raw = String(key || "");
  const match = raw.match(/^Default\.([^\.]+)\.(.+)$/);
  if (!match) {
    return { realm: "", name: raw };
  }

  return {
    realm: match[1],
    name: match[2]
  };
}

function parseLuaValue(raw) {
  const value = String(raw || "")
    .replace(/--.*$/, "")
    .trim()
    .replace(/,$/, "");

  if (!value || value === "nil") {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  const quoted = value.match(/^"([\s\S]*)"$/);
  if (quoted) {
    return quoted[1];
  }

  return value;
}

function parseItemLink(link) {
  const text = String(link || "");
  const linkMatch = text.match(/\|Hitem:(\d+):(-?\d*):(-?\d*):(-?\d*):(-?\d*):(-?\d*):(-?\d*):[\s\S]*?\|h\[([\s\S]*?)\]\|h/);
  if (linkMatch) {
    const colorMatch = text.match(/^\|cff([0-9a-fA-F]{6})\|Hitem:/);
    const color = colorMatch ? colorMatch[1].toLowerCase() : "ffffff";
    const randomSuffixId = Number(linkMatch[7]);

    return {
      itemId: Number(linkMatch[1]),
      enchantId: Number.isFinite(Number(linkMatch[2])) ? Number(linkMatch[2]) : 0,
      randomSuffixId: Number.isFinite(randomSuffixId) && randomSuffixId !== 0 ? randomSuffixId : 0,
      itemName: String(linkMatch[8] || "").trim(),
      qualityColor: color,
      quality: QUALITY_BY_COLOR[color] || "common",
      itemLink: text
    };
  }

  // DataStore variants can emit plain item strings like item:12345:1900:...
  const rawMatch = text.match(/(?:^|\b)item:(\d+):(-?\d*)(?::(-?\d*))?(?::(-?\d*))?(?::(-?\d*))?(?::(-?\d*))?(?::(-?\d*))?/i);
  if (!rawMatch) {
    return null;
  }

  const itemId = Number(rawMatch[1]);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return null;
  }

  const enchantId = Number(rawMatch[2]);
  const randomSuffixId = Number(rawMatch[7]);

  return {
    itemId,
    enchantId: Number.isFinite(enchantId) && enchantId > 0 ? enchantId : 0,
    randomSuffixId: Number.isFinite(randomSuffixId) && randomSuffixId !== 0 ? randomSuffixId : 0,
    itemName: "",
    qualityColor: "ffffff",
    quality: "common",
    itemLink: text
  };
}

function backfillUnknownItemNames(entries) {
  const knownById = new Map();

  entries.forEach((entry) => {
    (entry.equippedItems || []).forEach((item) => {
      if (item.itemId && item.itemName) {
        if (!knownById.has(item.itemId)) {
          knownById.set(item.itemId, item.itemName);
        }
      }
    });
  });

  return entries.map((entry) => ({
    ...entry,
    equippedItems: (entry.equippedItems || []).map((item) => {
      if (item.itemName) {
        return item;
      }

      const known = knownById.get(item.itemId);
      return {
        ...item,
        itemName: known || `Item #${item.itemId}`
      };
    })
  }));
}

function parseAnonymousInventoryEntries(lines, fileName = "", accountHintName = "") {
  const entries = [];
  let inRoot = false;
  let braceDepth = 0;
  let current = null;
  let characterIndex = 0;
  let inInventory = false;

  const pushEntry = () => {
    if (!current) {
      return;
    }

    const equippedItems = (current.inventory || [])
      .filter((item) => item && item.slot && item.itemId)
      .map((item) => ({
        slot: item.slot,
        slotName: SLOT_LABELS[item.slot] || `Slot ${item.slot}`,
        itemId: item.itemId,
        enchantId: Number.isFinite(Number(item.enchantId)) ? Number(item.enchantId) : 0,
        randomSuffixId: Number.isFinite(Number(item.randomSuffixId)) ? Number(item.randomSuffixId) : 0,
        itemName: item.itemName || `Item #${item.itemId}`,
        itemLink: item.itemLink,
        quality: item.quality,
        qualityColor: item.qualityColor
      }))
      .sort((a, b) => a.slot - b.slot);

    entries.push({
      characterName: `__anonymous_character_${current.characterIndex}`,
      realm: "",
      characterIndex: current.characterIndex,
      accountHintName: String(accountHintName || "").trim(),
      sourceFileName: fileName,
      averageItemLevel: typeof current.averageItemLvl === "number" ? current.averageItemLvl : null,
      overallItemLevel: typeof current.overallAIL === "number" ? current.overallAIL : null,
      lastInventoryUpdate: typeof current.lastUpdate === "number" ? current.lastUpdate : null,
      equippedItems
    });
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!inRoot && /^DataStore_Inventory_Characters\s*=\s*\{$/.test(trimmed)) {
      inRoot = true;
      braceDepth = 1;
      return;
    }

    if (!inRoot) {
      return;
    }

    if (trimmed === "{" && braceDepth === 1) {
      characterIndex += 1;
      current = {
        characterIndex,
        inventory: [],
        averageItemLvl: null,
        overallAIL: null,
        lastUpdate: null,
        nextSlot: 1
      };
      braceDepth += 1;
      return;
    }

    if (!current) {
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/}/g) || []).length;
      braceDepth += opens - closes;
      if (inRoot && braceDepth <= 0) {
        inRoot = false;
      }
      return;
    }

    if (!inInventory && /^\["Inventory"\]\s*=\s*\{$/.test(trimmed)) {
      inInventory = true;
      return;
    }

    if (inInventory) {
      if (trimmed === "}," || trimmed === "}") {
        inInventory = false;
      } else if (trimmed && trimmed !== "{" && trimmed !== "},") {
        const keyedSlotMatch = trimmed.match(/^\[(\d+)\]\s*=\s*(.+?)(?:,)?$/);
        if (keyedSlotMatch) {
          const slot = Number(keyedSlotMatch[1]);
          const value = parseLuaValue(keyedSlotMatch[2]);
          const parsedLink = parseItemLink(value);
          if (parsedLink) {
            current.inventory.push({ slot, ...parsedLink });
          }
          current.nextSlot = Math.max(current.nextSlot, slot + 1);
        } else {
          const value = parseLuaValue(trimmed);
          const slot = current.nextSlot;
          current.nextSlot += 1;
          const parsedLink = parseItemLink(value);
          if (parsedLink) {
            current.inventory.push({ slot, ...parsedLink });
          }
        }
      }
    }

    const averageItemLvlMatch = trimmed.match(/^\["averageItemLvl"\]\s*=\s*([0-9.]+),?$/);
    if (averageItemLvlMatch) {
      current.averageItemLvl = Number(averageItemLvlMatch[1]);
    }

    const overallAILMatch = trimmed.match(/^\["overallAIL"\]\s*=\s*([0-9.]+),?$/);
    if (overallAILMatch) {
      current.overallAIL = Number(overallAILMatch[1]);
    }

    const lastUpdateMatch = trimmed.match(/^\["lastUpdate"\]\s*=\s*(\d+),?$/);
    if (lastUpdateMatch) {
      current.lastUpdate = Number(lastUpdateMatch[1]);
    }

    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/}/g) || []).length;

    if (!inInventory && closes > opens && braceDepth === 2) {
      pushEntry();
      current = null;
    }

    braceDepth += opens - closes;
    if (inRoot && braceDepth <= 0) {
      inRoot = false;
      inInventory = false;
    }
  });

  return entries;
}

export function parseDataStoreInventory(luaText, fileName = "", accountHintName = "") {
  const lines = String(luaText || "").split(/\r?\n/);
  if (String(luaText || "").includes("DataStore_Inventory_Characters = {")) {
    const anonymousEntries = parseAnonymousInventoryEntries(lines, fileName, accountHintName);
    if (anonymousEntries.length) {
      return backfillUnknownItemNames(anonymousEntries);
    }
  }

  const stack = [];
  const entries = [];

  const pushContext = (ctx) => {
    stack.push(ctx);
  };

  const closeContext = () => {
    const ctx = stack.pop();

    if (ctx?.type === "inventory" && stack[stack.length - 1]?.type === "character") {
      stack[stack.length - 1].inventory = ctx.items;
      return;
    }

    if (ctx?.type !== "character") {
      return;
    }

    if (!ctx.name || !ctx.realm) {
      return;
    }

    const equippedItems = (ctx.inventory || [])
      .filter((item) => item && item.slot && item.itemId)
      .map((item) => ({
        slot: item.slot,
        slotName: SLOT_LABELS[item.slot] || `Slot ${item.slot}`,
        itemId: item.itemId,
        enchantId: Number.isFinite(Number(item.enchantId)) ? Number(item.enchantId) : 0,
        randomSuffixId: Number.isFinite(Number(item.randomSuffixId)) ? Number(item.randomSuffixId) : 0,
        itemName: item.itemName || `Item #${item.itemId}`,
        itemLink: item.itemLink,
        quality: item.quality,
        qualityColor: item.qualityColor
      }))
      .sort((a, b) => a.slot - b.slot);

    entries.push({
      characterName: ctx.name,
      realm: ctx.realm,
      characterIndex: null,
      accountHintName: String(accountHintName || "").trim(),
      sourceFileName: fileName,
      averageItemLevel: typeof ctx.averageItemLvl === "number" ? ctx.averageItemLvl : null,
      overallItemLevel: typeof ctx.overallAIL === "number" ? ctx.overallAIL : null,
      lastInventoryUpdate: typeof ctx.lastUpdate === "number" ? ctx.lastUpdate : null,
      equippedItems
    });
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    const keyedOpen = trimmed.match(/^\["([^"]+)"\]\s*=\s*\{$/);
    if (keyedOpen) {
      const key = keyedOpen[1];
      const parent = stack[stack.length - 1];

      if (!parent && key === "global") {
        pushContext({ type: "global", key });
        return;
      }

      if (parent?.type === "global" && key === "Characters") {
        pushContext({ type: "characters", key });
        return;
      }

      if (parent?.type === "characters") {
        const parsed = parseCharacterKey(key);
        pushContext({
          type: "character",
          key,
          name: parsed.name,
          realm: parsed.realm,
          inventory: [],
          averageItemLvl: null,
          overallAIL: null,
          lastUpdate: null
        });
        return;
      }

      if (parent?.type === "character" && key === "Inventory") {
        pushContext({ type: "inventory", key, items: [], nextSlot: 1 });
        return;
      }

      pushContext({ type: "object", key });
      return;
    }

    const current = stack[stack.length - 1];
    if (current?.type === "inventory") {
      if (!trimmed || trimmed === "{" || trimmed === "}," || trimmed === "}") {
        // skip structural lines
      } else {
        const keyedSlotMatch = trimmed.match(/^\[(\d+)\]\s*=\s*(.+?)(?:,)?$/);
        if (keyedSlotMatch) {
          const slot = Number(keyedSlotMatch[1]);
          const value = parseLuaValue(keyedSlotMatch[2]);
          const parsedLink = parseItemLink(value);
          if (parsedLink) {
            current.items.push({ slot, ...parsedLink });
          }
          current.nextSlot = Math.max(current.nextSlot, slot + 1);
        } else {
          const value = parseLuaValue(trimmed);
          const slot = current.nextSlot;
          current.nextSlot += 1;
          const parsedLink = parseItemLink(value);
          if (parsedLink) {
            current.items.push({ slot, ...parsedLink });
          }
        }
      }
    }

    const charCtx = [...stack].reverse().find((entry) => entry.type === "character");
    if (charCtx) {
      const averageItemLvlMatch = trimmed.match(/^\["averageItemLvl"\]\s*=\s*([0-9.]+),?$/);
      if (averageItemLvlMatch) {
        charCtx.averageItemLvl = Number(averageItemLvlMatch[1]);
      }

      const overallAILMatch = trimmed.match(/^\["overallAIL"\]\s*=\s*([0-9.]+),?$/);
      if (overallAILMatch) {
        charCtx.overallAIL = Number(overallAILMatch[1]);
      }

      const lastUpdateMatch = trimmed.match(/^\["lastUpdate"\]\s*=\s*(\d+),?$/);
      if (lastUpdateMatch) {
        charCtx.lastUpdate = Number(lastUpdateMatch[1]);
      }
    }

    const closes = (trimmed.match(/}/g) || []).length;
    for (let index = 0; index < closes; index += 1) {
      if (stack.length) {
        closeContext();
      }
    }
  });

  return backfillUnknownItemNames(entries);
}

export const INVENTORY_SLOT_LABELS = SLOT_LABELS;
