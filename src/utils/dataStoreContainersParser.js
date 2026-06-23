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
  const match = String(link || "").match(/\|Hitem:(\d+):.*?\|h\[(.*?)\]\|h\|r/);
  if (!match) {
    return { itemId: null, itemName: "" };
  }

  return {
    itemId: Number(match[1]),
    itemName: match[2]
  };
}

function parseLuaValue(raw) {
  const value = String(raw || "").trim().replace(/,$/, "");

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

    const links = Array.isArray(ctx.links) ? ctx.links : [];
    const ids = Array.isArray(ctx.ids) ? ctx.ids : [];
    const counts = Array.isArray(ctx.counts) ? ctx.counts : [];
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

      items.push({
        characterName: ctx.characterName,
        realm: ctx.realm,
        itemId: safeItemId,
        itemName,
        count: Number.isFinite(count) && count > 0 ? count : 1,
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

  return items;
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
    const queryKey = `${item.itemId || ""}|${normalize(item.itemName)}`;
    if (!groups.has(queryKey)) {
      groups.set(queryKey, {
        itemId: item.itemId,
        itemName: item.itemName,
        owners: new Map()
      });
    }

    const group = groups.get(queryKey);
    const ownerKey = `${normalize(item.characterName)}|${normalize(item.realm)}`;

    if (!group.owners.has(ownerKey)) {
      const character = characterByKey.get(ownerKey) || null;
      group.owners.set(ownerKey, {
        characterName: item.characterName,
        realm: item.realm,
        accountName: character?.accountId ? accountNameById.get(character.accountId) || "" : "",
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
      owners: [...group.owners.values()]
        .map((owner) => ({
          ...owner,
          fileNames: [...owner.fileNames]
        }))
        .sort((a, b) => a.characterName.localeCompare(b.characterName))
    }))
    .sort((a, b) => b.owners.length - a.owners.length || a.itemName.localeCompare(b.itemName));
}