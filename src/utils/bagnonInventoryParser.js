function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function parseCharacterLabel(label, fileName = "") {
  const raw = String(label || "").trim().replace(/^Default\./, "");

  if (raw.includes(" - ")) {
    const parts = raw.split(" - ");
    return {
      name: parts.shift()?.trim() || raw,
      realm: parts.join(" - ").trim()
    };
  }

  const lastDot = raw.lastIndexOf(".");
  if (lastDot > 0) {
    return {
      realm: raw.slice(0, lastDot),
      name: raw.slice(lastDot + 1)
    };
  }

  const fallbackName = String(fileName || "").replace(/\.lua$/i, "").trim();
  return {
    name: raw || fallbackName || "Unknown",
    realm: ""
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

function inferLocationGroup(key, stack) {
  const keyText = String(key || "").toLowerCase();
  if (keyText.includes("bank")) {
    return "bank";
  }
  if (keyText.includes("bag") || keyText.includes("inventory") || keyText.includes("container")) {
    return "bags";
  }

  const nearestLocation = [...stack].reverse().find((entry) => entry.type === "location");
  return nearestLocation?.locationGroup || "bags";
}

function looksLikeCharacterKey(key) {
  const text = String(key || "").trim();
  if (!text) {
    return false;
  }

  return text.includes(" - ") || text.startsWith("Default.") || /^[^.]+\.[^.]+$/.test(text);
}

function extractCount(line) {
  const matches = [
    line.match(/\bcount\s*=\s*(\d+)/i),
    line.match(/\bstack\s*=\s*(\d+)/i),
    line.match(/\bquantity\s*=\s*(\d+)/i),
    line.match(/\bamount\s*=\s*(\d+)/i)
  ];

  for (const match of matches) {
    if (match) {
      return Number(match[1]);
    }
  }

  return 1;
}

export function parseBagnonInventory(luaText, fileName = "", accountHintName = "") {
  const lines = String(luaText || "").split(/\r?\n/);
  const stack = [];
  const items = [];
  let fallbackCharacter = String(accountHintName || fileName || "").replace(/\.lua$/i, "").trim();

  const currentCharacter = () => [...stack].reverse().find((entry) => entry.type === "character") || null;

  const openContext = (ctx) => {
    stack.push(ctx);
  };

  const closeContext = () => {
    const ctx = stack.pop();
    if (ctx?.type === "character" && ctx.name) {
      fallbackCharacter = ctx.name;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const parent = stack[stack.length - 1];

    const keyedOpen = trimmed.match(/^\["([^"]+)"\]\s*=\s*\{$/);
    if (keyedOpen) {
      const key = keyedOpen[1];

      if (!parent && key === "global") {
        openContext({ type: "global", key });
        return;
      }

      if (parent?.type === "global" && looksLikeCharacterKey(key)) {
        const parsed = parseCharacterLabel(key, fallbackCharacter);
        openContext({
          type: "character",
          key,
          name: parsed.name,
          realm: parsed.realm
        });
        return;
      }

      if (parent?.type === "global" && ["profiles", "characters", "bank", "bags", "inventory", "containers"].includes(key.toLowerCase())) {
        openContext({ type: "container-root", key });
        return;
      }

      if (parent?.type === "container-root" && looksLikeCharacterKey(key)) {
        const parsed = parseCharacterLabel(key, fallbackCharacter);
        openContext({
          type: "character",
          key,
          name: parsed.name,
          realm: parsed.realm
        });
        return;
      }

      if (parent?.type === "character" && /bag|bank|inventory|container|equipment/i.test(key)) {
        openContext({
          type: "location",
          key,
          locationGroup: inferLocationGroup(key, stack)
        });
        return;
      }

      if (parent?.type === "location" && ["links", "ids", "items", "counts", "slots"].includes(key.toLowerCase())) {
        openContext({ type: "array", key, values: [] });
        return;
      }

      openContext({ type: "object", key });
      return;
    }

    const characterLine = trimmed.match(/^\["([^"]+)"\]\s*=\s*\{$/);
    if (characterLine) {
      const key = characterLine[1];
      if (looksLikeCharacterKey(key) && (!currentCharacter() || parent?.type === "container-root")) {
        const parsed = parseCharacterLabel(key, fallbackCharacter);
        openContext({
          type: "character",
          key,
          name: parsed.name,
          realm: parsed.realm
        });
        return;
      }
    }

    if (parent?.type === "character" && /bag|bank|inventory|container|equipment/i.test(trimmed)) {
      openContext({
        type: "location",
        key: parent.key,
        locationGroup: inferLocationGroup(parent.key, stack)
      });
    }

    const activeCharacter = currentCharacter();
    const activeLocation = [...stack].reverse().find((entry) => entry.type === "location") || null;
    if (activeCharacter) {
      const itemMatches = [...trimmed.matchAll(/\|Hitem:(\d+):.*?\|h\[(.*?)\]\|h\|r/g)];
      if (itemMatches.length) {
        const count = extractCount(trimmed);
        itemMatches.forEach((match, index) => {
          items.push({
            characterName: activeCharacter.name || fallbackCharacter || "Unknown",
            realm: activeCharacter.realm || "",
            itemId: Number(match[1]),
            itemName: match[2],
            count,
            locationGroup: activeLocation?.locationGroup || inferLocationGroup(activeLocation?.key || "bags", stack),
            bagKey: activeLocation?.key || "bags",
            slotIndex: index + 1,
            sourceFileName: fileName
          });
        });
      }
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

export function summarizeBagnonInventory(items, characters = [], accounts = []) {
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