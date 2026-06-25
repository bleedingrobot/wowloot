function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function parseCharacterKey(key) {
  const raw = String(key || "").replace(/^Default\./, "");
  const lastDot = raw.lastIndexOf(".");

  if (lastDot === -1) {
    return { name: raw, realm: "" };
  }

  return {
    realm: raw.slice(0, lastDot),
    name: raw.slice(lastDot + 1)
  };
}

function parseItemLink(link) {
  const text = String(link || "");
  const match = text.match(/\|Hitem:(\d+):.*?\|h\[(.*?)\]\|h(?:\|r)?/);
  if (!match) {
    return { itemId: null, itemName: "", stackCount: null };
  }

  const stackMatch = text.match(/[;x*](\d+)\s*(?:,|$)/i);
  const stackCount = stackMatch ? Number(stackMatch[1]) : null;

  return {
    itemId: Number(match[1]),
    itemName: match[2],
    stackCount: Number.isFinite(stackCount) && stackCount > 0 ? stackCount : null
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

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const quoted = value.match(/^"([\s\S]*)"$/);
  if (quoted) {
    return quoted[1];
  }

  return value;
}

function parseArrayLine(line, values) {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "{" || trimmed === "}," || trimmed === "}") {
    return;
  }

  const keyedMatch = trimmed.match(/^\[(\d+)\]\s*=\s*(.+?)(?:,)?$/);
  if (keyedMatch) {
    values[Number(keyedMatch[1]) - 1] = parseLuaValue(keyedMatch[2]);
    return;
  }

  values.push(parseLuaValue(trimmed));
}

function parseNumericToken(token) {
  const text = String(token || "").trim();
  if (!text || text === "nil") {
    return null;
  }

  const numberMatch = text.match(/^-?\d+$/);
  if (!numberMatch) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceNumericArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const parsed = Number(entry);
      return Number.isFinite(parsed) ? parsed : null;
    });
  }

  if (typeof value === "number") {
    return [value];
  }

  if (typeof value !== "string") {
    return [];
  }

  const text = value.trim();
  if (!text) {
    return [];
  }

  return text
    .split(/[;,|\s]+/)
    .map(parseNumericToken)
    .filter((entry) => entry !== null);
}

function coerceLinkArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return [];
  }

  const text = value.trim();
  if (!text) {
    return [];
  }

  const matches = text.match(/\|Hitem:[\s\S]*?\|h\[[\s\S]*?\]\|h(?:\|r)?/g);
  return matches || [];
}

function backfillUnknownItemNames(items) {
  const nameById = new Map();

  items.forEach((item) => {
    if (Number.isFinite(item.itemId) && item.itemName && item.itemName !== "Unknown item") {
      if (!nameById.has(item.itemId)) {
        nameById.set(item.itemId, item.itemName);
      }
    }
  });

  return items.map((item) => {
    if (item.itemName !== "Unknown item") {
      return item;
    }

    const resolvedName = nameById.get(item.itemId);
    if (!resolvedName) {
      return item;
    }

    return {
      ...item,
      itemName: resolvedName
    };
  });
}

export function parseDataStoreContainers(luaText, fileName = "") {
  const lines = String(luaText || "").split(/\r?\n/);
  const stack = [];
  const items = [];

  const openContext = (ctx) => {
    stack.push(ctx);
  };

  const closeContext = () => {
    const ctx = stack.pop();

    if (ctx?.type === "array" && stack[stack.length - 1]?.type === "bag") {
      stack[stack.length - 1][ctx.key] = ctx.values;
      return;
    }

    if (ctx?.type !== "bag") {
      return;
    }

    if (ctx.group === "other") {
      return;
    }

    const links = coerceLinkArray(ctx.links);
    const ids = coerceNumericArray(ctx.ids);
    const counts = coerceNumericArray(ctx.counts);
    const maxLength = Math.max(links.length, ids.length, counts.length);

    for (let slotIndex = 0; slotIndex < maxLength; slotIndex += 1) {
      const link = links[slotIndex];
      const itemId = ids[slotIndex];
      const count = counts[slotIndex];

      if (!link && !itemId) {
        continue;
      }

      const parsed = parseItemLink(link);
      const itemName = parsed.itemName || "Unknown item";
      const safeItemId = Number.isFinite(itemId) ? itemId : parsed.itemId;

      if (!itemName || !safeItemId) {
        continue;
      }

      const parsedCount = Number(count);
      const safeCount = Number.isFinite(parsedCount) && parsedCount > 0
        ? parsedCount
        : parsed.stackCount || 1;

      items.push({
        characterName: ctx.characterName,
        realm: ctx.realm,
        itemId: safeItemId,
        itemName,
        count: safeCount,
        locationGroup: ctx.group,
        bagKey: ctx.bagKey,
        slotIndex: slotIndex + 1,
        sourceFileName: fileName
      });
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    const keyedOpen = trimmed.match(/^\["([^"]+)"\]\s*=\s*\{$/);
    if (keyedOpen) {
      const key = keyedOpen[1];
      const parent = stack[stack.length - 1];

      if (!parent && key === "global") {
        openContext({ type: "global", key });
        return;
      }

      if (parent?.type === "global" && key === "Characters") {
        openContext({ type: "characters", key });
        return;
      }

      if (parent?.type === "characters") {
        const parsed = parseCharacterKey(key);
        openContext({
          type: "character",
          key,
          name: parsed.name,
          realm: parsed.realm
        });
        return;
      }

      if (parent?.type === "character" && key === "Containers") {
        openContext({
          type: "containers",
          key,
          characterName: parent.name,
          realm: parent.realm
        });
        return;
      }

      if (parent?.type === "containers" && /^Bag-?\d+$/.test(key)) {
        const bagIndex = Number(key.slice(3));
        openContext({
          type: "bag",
          key,
          bagKey: key,
          bagIndex,
          group: bagIndex >= 5 ? "bank" : "bags",
          characterName: parent.characterName,
          realm: parent.realm
        });
        return;
      }

      if (parent?.type === "bag" && ["links", "ids", "counts"].includes(key)) {
        openContext({ type: "array", key, values: [] });
        return;
      }

      openContext({ type: "object", key });
      return;
    }

    const current = stack[stack.length - 1];
    if (current?.type === "array") {
      parseArrayLine(trimmed, current.values);
    }

    const closes = (trimmed.match(/}/g) || []).length;
    for (let index = 0; index < closes; index += 1) {
      if (stack.length) {
        closeContext();
      }
    }
  });

  return backfillUnknownItemNames(items);
}

export function summarizeInventoryItems(items, characters = [], accounts = []) {
  const accountNameById = new Map(accounts.map((account) => [account.id, account.battleNetId]));
  const characterByKey = new Map(
    characters.map((character) => [
      `${normalize(character.name)}|${normalize(character.realm)}`,
      character
    ])
  );

  const groups = new Map();

  items.forEach((item) => {
    const normalizedName = normalize(item.itemName);
    const hasItemId = Number.isFinite(Number(item.itemId)) && Number(item.itemId) > 0;
    const safeItemId = hasItemId ? Number(item.itemId) : null;
    const queryKey = hasItemId ? `id:${safeItemId}` : `name:${normalizedName}`;

    if (!groups.has(queryKey)) {
      groups.set(queryKey, {
        itemId: safeItemId,
        itemName: item.itemName || "Unknown item",
        aliases: new Set(),
        owners: new Map(),
        hasKnownName: Boolean(item.itemName && normalize(item.itemName) !== "unknown item")
      });
    }

    const group = groups.get(queryKey);
    if (item.itemName) {
      group.aliases.add(item.itemName);
    }

    const incomingIsKnown = Boolean(item.itemName && normalize(item.itemName) !== "unknown item");
    if (incomingIsKnown && (!group.hasKnownName || normalize(group.itemName) === "unknown item")) {
      group.itemName = item.itemName;
      group.hasKnownName = true;
    }

    const ownerKey = `${normalize(item.characterName)}|${normalize(item.realm)}`;

    if (!group.owners.has(ownerKey)) {
      const character = characterByKey.get(ownerKey) || null;
      group.owners.set(ownerKey, {
        characterName: item.characterName,
        realm: item.realm,
        accountId: character?.accountId || "",
        accountName: character?.accountId ? accountNameById.get(character.accountId) || "" : "",
        class: character?.class || "",
        faction: character?.faction || "",
        level: character?.level ?? "",
        showOnDashboard: character?.showOnDashboard !== false,
        activeRaidTag: character?.activeRaidTag || "",
        bags: 0,
        bank: 0,
        total: 0,
        fileNames: new Set()
      });
    }

    const owner = group.owners.get(ownerKey);
    if (item.locationGroup === "bank") {
      owner.bank += item.count;
    } else {
      owner.bags += item.count;
    }
    owner.total += item.count;
    if (item.sourceFileName) {
      owner.fileNames.add(item.sourceFileName);
    }
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      aliases: [...group.aliases],
      owners: [...group.owners.values()]
        .map((owner) => ({
          ...owner,
          fileNames: [...owner.fileNames]
        }))
        .sort((a, b) => a.characterName.localeCompare(b.characterName))
    }))
    .sort((a, b) => b.owners.length - a.owners.length || a.itemName.localeCompare(b.itemName));
}