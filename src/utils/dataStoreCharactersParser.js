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

function parseAnonymousCharactersInfo(lines, fileName = "", accountHintName = "") {
  const entries = [];
  let inInfoRoot = false;
  let braceDepth = 0;
  let current = null;
  let characterIndex = 0;

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!inInfoRoot && /^DataStore_Characters_Info\s*=\s*\{$/.test(trimmed)) {
      inInfoRoot = true;
      braceDepth = 1;
      return;
    }

    if (!inInfoRoot) {
      return;
    }

    if (trimmed === "{" && braceDepth === 1) {
      characterIndex += 1;
      current = { characterIndex };
      braceDepth += 1;
      return;
    }

    if (current) {
      const keyedValueMatch = trimmed.match(/^\["([^"]+)"\]\s*=\s*(.+?)(?:,)?$/);
      if (keyedValueMatch) {
        const field = keyedValueMatch[1];
        const value = parseLuaValue(keyedValueMatch[2]);
        current[field] = value;
      }
    }

    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/}/g) || []).length;

    if (current && closes > opens && braceDepth === 2) {
      if (current.name) {
        entries.push({
          characterName: current.name,
          realm: "",
          characterIndex: current.characterIndex,
          accountHintName: String(accountHintName || "").trim(),
          sourceFileName: fileName,
          className: current.class || current.englishClass || "",
          race: current.race || current.englishRace || "",
          faction: current.localizedFaction || current.faction || "",
          level: typeof current.level === "number" ? current.level : null,
          money: typeof current.money === "number" ? current.money : null,
          zone: current.zone || "",
          subZone: current.subZone || "",
          bindLocation: current.bindLocation || "",
          guildName: current.guildName || "",
          guildRankName: current.guildRankName || "",
          guildRankIndex: typeof current.guildRankIndex === "number" ? current.guildRankIndex : null,
          isResting: typeof current.isResting === "boolean" ? current.isResting : null,
          played: typeof current.played === "number" ? current.played : null,
          playedThisLevel: typeof current.playedThisLevel === "number" ? current.playedThisLevel : null,
          xp: typeof current.XP === "number" ? current.XP : null,
          xpMax: typeof current.XPMax === "number" ? current.XPMax : typeof current.maxXP === "number" ? current.maxXP : null,
          restXp: typeof current.RestXP === "number" ? current.RestXP : typeof current.restXP === "number" ? current.restXP : null,
          lastCharacterUpdate: typeof current.lastUpdate === "number" ? current.lastUpdate : null,
          lastLogoutTimestamp: typeof current.lastLogoutTimestamp === "number" ? current.lastLogoutTimestamp : null
        });
      }
      current = null;
    }

    braceDepth += opens - closes;
    if (inInfoRoot && braceDepth <= 0) {
      inInfoRoot = false;
    }
  });

  return entries;
}

export function parseDataStoreCharacters(luaText, fileName = "", accountHintName = "") {
  const lines = String(luaText || "").split(/\r?\n/);
  if (String(luaText || "").includes("DataStore_Characters_Info = {")) {
    const anonymousEntries = parseAnonymousCharactersInfo(lines, fileName, accountHintName);
    if (anonymousEntries.length) {
      return anonymousEntries;
    }
  }

  const stack = [];
  const entries = [];

  const pushContext = (ctx) => {
    stack.push(ctx);
  };

  const closeContext = () => {
    const ctx = stack.pop();
    if (ctx?.type !== "character") {
      return;
    }

    if (!ctx.name || !ctx.realm) {
      return;
    }

    entries.push({
      characterName: ctx.name,
      realm: ctx.realm,
      characterIndex: null,
      accountHintName: String(accountHintName || "").trim(),
      sourceFileName: fileName,
      className: ctx.class || ctx.englishClass || "",
      race: ctx.race || ctx.englishRace || "",
      faction: ctx.localizedFaction || ctx.faction || "",
      level: typeof ctx.level === "number" ? ctx.level : null,
      money: typeof ctx.money === "number" ? ctx.money : null,
      zone: ctx.zone || "",
      subZone: ctx.subZone || "",
      bindLocation: ctx.bindLocation || "",
      guildName: ctx.guildName || "",
      guildRankName: ctx.guildRankName || "",
      guildRankIndex: typeof ctx.guildRankIndex === "number" ? ctx.guildRankIndex : null,
      isResting: typeof ctx.isResting === "boolean" ? ctx.isResting : null,
      played: typeof ctx.played === "number" ? ctx.played : null,
      playedThisLevel: typeof ctx.playedThisLevel === "number" ? ctx.playedThisLevel : null,
      xp: typeof ctx.XP === "number" ? ctx.XP : null,
      xpMax: typeof ctx.XPMax === "number" ? ctx.XPMax : null,
      restXp: typeof ctx.RestXP === "number" ? ctx.RestXP : null,
      lastCharacterUpdate: typeof ctx.lastUpdate === "number" ? ctx.lastUpdate : null,
      lastLogoutTimestamp: typeof ctx.lastLogoutTimestamp === "number" ? ctx.lastLogoutTimestamp : null
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
          realm: parsed.realm
        });
        return;
      }

      pushContext({ type: "object", key });
      return;
    }

    const charCtx = [...stack].reverse().find((entry) => entry.type === "character");
    if (charCtx) {
      const keyedValueMatch = trimmed.match(/^\["([^"]+)"\]\s*=\s*(.+?)(?:,)?$/);
      if (keyedValueMatch) {
        const field = keyedValueMatch[1];
        const value = parseLuaValue(keyedValueMatch[2]);
        charCtx[field] = value;
      }
    }

    const closes = (trimmed.match(/}/g) || []).length;
    for (let index = 0; index < closes; index += 1) {
      if (stack.length) {
        closeContext();
      }
    }
  });

  return entries;
}
