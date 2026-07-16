function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function aggregateItemKey(item) {
  const character = normalize(item?.characterName);
  const realm = normalize(item?.realm);
  const itemId = Number(item?.itemId);
  const safeItemId = Number.isFinite(itemId) && itemId > 0 ? String(itemId) : "";
  const itemName = normalize(item?.itemName);
  return `${character}|${realm}|${safeItemId}|${itemName}`;
}

function normalizeLoose(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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

function extractInlineCount(line, fallback = 1) {
  const matches = [
    String(line || "").match(/\["count"\]\s*=\s*(\d+)/i),
    String(line || "").match(/\bcount\s*=\s*(\d+)/i),
    String(line || "").match(/\["quantity"\]\s*=\s*(\d+)/i),
    String(line || "").match(/\bquantity\s*=\s*(\d+)/i),
    String(line || "").match(/[;x*](\d+)\s*(?:,|$)/i)
  ];

  for (const match of matches) {
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return fallback;
}

function extractLooseContainerItems(luaText, fileName = "", accountHintName = "") {
  const lines = String(luaText || "").split(/\r?\n/);
  const items = [];
  let currentCharacter = {
    name: String(accountHintName || fileName || "Unknown").replace(/\.lua$/i, "").trim() || "Unknown",
    realm: "",
    characterIndex: null
  };
  let currentBagKey = "bags";
  let currentLocationGroup = "bags";
  let inAnonymousCharacters = false;
  let anonymousBraceDepth = 0;
  let anonymousCharacterIndex = 0;

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!inAnonymousCharacters && /^DataStore_Containers_Characters\s*=\s*\{$/.test(trimmed)) {
      inAnonymousCharacters = true;
      anonymousBraceDepth = 1;
      return;
    }

    if (inAnonymousCharacters && trimmed === "{" && anonymousBraceDepth === 1) {
      anonymousCharacterIndex += 1;
      currentCharacter = {
        name: `__anonymous_character_${anonymousCharacterIndex}`,
        realm: "",
        characterIndex: anonymousCharacterIndex
      };
      anonymousBraceDepth += 1;
      return;
    }

    const defaultCharacterMatch = trimmed.match(/^\["Default\.([^".]+)\.([^".]+)"\]\s*=\s*\{$/);
    if (defaultCharacterMatch) {
      currentCharacter = {
        realm: defaultCharacterMatch[1],
        name: defaultCharacterMatch[2],
        characterIndex: null
      };
    }

    const splitCharacterMatch = trimmed.match(/^\["(.+?)\s+-\s+(.+?)"\]\s*=\s*\{$/);
    if (splitCharacterMatch) {
      currentCharacter = {
        name: splitCharacterMatch[1],
        realm: splitCharacterMatch[2],
        characterIndex: null
      };
    }

    const bagMatch = trimmed.match(/^\["(Bag-?\d+|Bank[^"\]]*)"\]\s*=\s*\{$/i);
    if (bagMatch) {
      currentBagKey = bagMatch[1];
      currentLocationGroup = /bank/i.test(currentBagKey) ? "bank" : "bags";
    }

    const itemMatches = [...trimmed.matchAll(/\|Hitem:(\d+):.*?\|h\[(.*?)\]\|h\|r(?:[;x*](\d+))?/g)];
    if (itemMatches.length) {
      itemMatches.forEach((match, index) => {
        const inlineCount = Number(match[3]);
        const safeCount = Number.isFinite(inlineCount) && inlineCount > 0
          ? inlineCount
          : extractInlineCount(trimmed, 1);

        items.push({
          characterName: currentCharacter.name || "Unknown",
          realm: currentCharacter.realm || "",
          characterIndex: currentCharacter.characterIndex ?? null,
          itemId: Number(match[1]),
          itemName: match[2],
          count: safeCount,
          locationGroup: currentLocationGroup,
          bagKey: currentBagKey,
          slotIndex: index + 1,
          sourceFileName: fileName,
          accountHintName: String(accountHintName || "").trim()
        });
      });
    }

    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/}/g) || []).length;
    if (inAnonymousCharacters) {
      anonymousBraceDepth += opens - closes;
      if (anonymousBraceDepth <= 0) {
        inAnonymousCharacters = false;
        anonymousBraceDepth = 0;
      }
    }
  });

  return items;
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

  const keyedMatch = trimmed.match(/^\[(?:"|')?(\d+)(?:"|')?\]\s*=\s*(.+?)(?:,)?$/);
  if (keyedMatch) {
    values[Number(keyedMatch[1])] = parseLuaValue(keyedMatch[2]);
    return;
  }

  values.push(parseLuaValue(trimmed));
}

function parseInlineTableValue(key, rawValue) {
  const value = String(rawValue || "").trim();
  const isTable = value.startsWith("{") && value.endsWith("}");

  if (!isTable) {
    return parseLuaValue(value);
  }

  const inner = value.slice(1, -1).trim();
  if (!inner) {
    return [];
  }

  const parseIndexedEntries = () => {
    const values = [];
    const keyedRegex = /\[(?:"|')?(\d+)(?:"|')?\]\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,}]+)/g;
    let match;
    let remainder = inner;

    while ((match = keyedRegex.exec(inner)) !== null) {
      const index = Number(match[1]);
      if (Number.isFinite(index) && index >= 0) {
        values[index] = parseLuaValue(match[2]);
      }
    }

    remainder = remainder.replace(keyedRegex, "").trim();
    if (remainder) {
      remainder
        .split(",")
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => values.push(parseLuaValue(token)));
    }

    return values;
  };

  if (key === "links") {
    return parseIndexedEntries();
  }

  if (key === "ids" || key === "counts") {
    return parseIndexedEntries();
  }

  return parseLuaValue(value);
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

function decodePackedContainerItem(raw) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { itemId: null, count: null };
  }

  const itemId = Math.floor(numeric / 65536);
  const count = numeric % 65536;
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return { itemId: null, count: null };
  }

  return {
    itemId,
    count: Number.isFinite(count) && count > 0 ? count : 1
  };
}

function parseAnonymousDataStoreContainers(luaText, fileName = "", accountHintName = "") {
  const lines = String(luaText || "").split(/\r?\n/);
  const items = [];

  let inRoot = false;
  let rootDepth = 0;
  let inCharacter = false;
  let characterDepth = 0;
  let characterIndex = 0;
  let inContainers = false;
  let containersDepth = 0;
  let bagIndex = 0;

  let inBag = false;
  let bagDepth = 0;
  let inItemsTable = false;
  let inLinksTable = false;
  let nextItemSlot = 1;
  let nextLinkSlot = 1;
  let packedBySlot = new Map();
  let linkBySlot = new Map();

  const flushBag = () => {
    const slotSet = new Set([...packedBySlot.keys(), ...linkBySlot.keys()]);
    slotSet.forEach((slot) => {
      const link = linkBySlot.get(slot);
      const packed = packedBySlot.get(slot);
      if (!link && (packed == null || packed === 0)) {
        return;
      }

      const parsedLink = parseItemLink(link);
      const packedDecoded = decodePackedContainerItem(packed);
      const itemId = parsedLink.itemId || packedDecoded.itemId;
      const itemName = parsedLink.itemName || "Unknown item";
      const count = packedDecoded.count || parsedLink.stackCount || 1;

      if (!Number.isFinite(itemId) || itemId <= 0) {
        return;
      }

      items.push({
        characterName: `__anonymous_character_${characterIndex}`,
        realm: "",
        characterIndex,
        itemId,
        itemName,
        count,
        locationGroup: bagIndex >= 6 ? "bank" : "bags",
        bagKey: `Bag${Math.max(0, bagIndex - 1)}`,
        slotIndex: slot,
        sourceFileName: fileName,
        accountHintName: String(accountHintName || "").trim()
      });
    });
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!inRoot && /^DataStore_Containers_Characters\s*=\s*\{/.test(trimmed)) {
      inRoot = true;
      rootDepth = 1;
      return;
    }

    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/}/g) || []).length;

    if (!inRoot) {
      return;
    }

    if (!inCharacter && trimmed === "{" && rootDepth === 1) {
      inCharacter = true;
      characterDepth = 1;
      characterIndex += 1;
      bagIndex = 0;
      rootDepth += 1;
      return;
    }

    if (inCharacter) {
      if (!inContainers && /^\["Containers"\]\s*=\s*\{/.test(trimmed)) {
        inContainers = true;
        containersDepth = 0;
      } else if (inContainers && !inBag && trimmed === "{" && containersDepth === 1) {
        inBag = true;
        bagDepth = 0;
        bagIndex += 1;
        inItemsTable = false;
        inLinksTable = false;
        nextItemSlot = 1;
        nextLinkSlot = 1;
        packedBySlot = new Map();
        linkBySlot = new Map();
      } else if (inBag) {
        if (!inItemsTable && /^\["items"\]\s*=\s*\{/.test(trimmed)) {
          inItemsTable = true;
          nextItemSlot = 1;
        } else if (!inLinksTable && /^\["links"\]\s*=\s*\{/.test(trimmed)) {
          inLinksTable = true;
          nextLinkSlot = 1;
        } else if (inItemsTable) {
          if (trimmed === "}," || trimmed === "}") {
            inItemsTable = false;
          } else {
            const keyed = trimmed.match(/^\[(\d+)\]\s*=\s*(nil|-?\d+)(?:,)?$/i);
            if (keyed) {
              const slot = Number(keyed[1]);
              const value = /^nil$/i.test(keyed[2]) ? null : Number(keyed[2]);
              if (Number.isFinite(slot) && slot > 0) {
                packedBySlot.set(slot, value);
              }
              nextItemSlot = Math.max(nextItemSlot, slot + 1);
            } else {
              const rawValue = trimmed.replace(/,$/, "").trim();
              if (/^nil$/i.test(rawValue)) {
                packedBySlot.set(nextItemSlot, null);
                nextItemSlot += 1;
              } else {
                const numeric = Number(rawValue);
                if (Number.isFinite(numeric)) {
                  packedBySlot.set(nextItemSlot, numeric);
                }
                nextItemSlot += 1;
              }
            }
          }
        } else if (inLinksTable) {
          if (trimmed === "}," || trimmed === "}") {
            inLinksTable = false;
          } else {
            const keyed = trimmed.match(/^\[(\d+)\]\s*=\s*"([\s\S]*?)"(?:,)?$/);
            if (keyed) {
              const slot = Number(keyed[1]);
              if (Number.isFinite(slot) && slot > 0) {
                linkBySlot.set(slot, keyed[2]);
              }
              nextLinkSlot = Math.max(nextLinkSlot, slot + 1);
            } else {
              const inline = trimmed.match(/^"([\s\S]*?)"(?:,)?$/);
              if (inline) {
                linkBySlot.set(nextLinkSlot, inline[1]);
                nextLinkSlot += 1;
              }
            }
          }
        }
      }
    }

    if (inBag) {
      bagDepth += opens - closes;
      if (bagDepth <= 0) {
        flushBag();
        inBag = false;
        inItemsTable = false;
        inLinksTable = false;
      }
    } else if (inContainers) {
      containersDepth += opens - closes;
      if (containersDepth <= 0) {
        inContainers = false;
      }
    }

    if (inCharacter) {
      characterDepth += opens - closes;
      if (characterDepth <= 0) {
        inCharacter = false;
      }
    }

    rootDepth += opens - closes;
    if (rootDepth <= 0) {
      inRoot = false;
      rootDepth = 0;
    }
  });

  return backfillUnknownItemNames(items);
}

export function parseDataStoreContainers(luaText, fileName = "", accountHintName = "") {
  if (/DataStore_Containers_Characters\s*=\s*\{/.test(String(luaText || ""))) {
    return parseAnonymousDataStoreContainers(luaText, fileName, accountHintName);
  }

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
        sourceFileName: fileName,
        accountHintName: String(accountHintName || "").trim()
      });
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    let handledInlineBagField = false;

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

    const keyedValueMatch = trimmed.match(/^\["([^"]+)"\]\s*=\s*(.+?)(?:,)?$/);
    if (keyedValueMatch) {
      const key = keyedValueMatch[1];
      const value = keyedValueMatch[2];
      const parent = stack[stack.length - 1];

      if (parent?.type === "bag" && ["links", "ids", "counts"].includes(key)) {
        parent[key] = parseInlineTableValue(key, value);
        handledInlineBagField = true;
      }
    }

    const current = stack[stack.length - 1];
    if (current?.type === "array") {
      parseArrayLine(trimmed, current.values);
    }

    const closes = handledInlineBagField ? 0 : (trimmed.match(/}/g) || []).length;
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
  const characterByKey = new Map();

  characters.forEach((character) => {
    const key = `${normalizeLoose(character.name)}|${normalizeLoose(character.realm)}`;
    if (!characterByKey.has(key)) {
      characterByKey.set(key, []);
    }
    characterByKey.get(key).push(character);
  });

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

    const ownerKey = `${normalizeLoose(item.characterName)}|${normalizeLoose(item.realm)}|${normalize(item.accountHintName)}`;

    if (!group.owners.has(ownerKey)) {
      const candidates = characterByKey.get(`${normalizeLoose(item.characterName)}|${normalizeLoose(item.realm)}`) || [];
      const hintedAccount = normalize(item.accountHintName);
      const character = candidates.find((candidate) => {
        const candidateAccount = normalize(accountNameById.get(candidate.accountId) || "");
        if (!hintedAccount) {
          return true;
        }

        return candidateAccount === hintedAccount;
      }) || null;
      group.owners.set(ownerKey, {
        characterName: item.characterName,
        realm: item.realm,
        accountId: character?.accountId || "",
        accountName: character?.accountId
          ? accountNameById.get(character.accountId) || ""
          : String(item.accountHintName || ""),
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