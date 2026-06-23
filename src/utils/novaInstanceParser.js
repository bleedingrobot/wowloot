const RAID_NAME_MAP = {
  "Molten Core": "Molten Core",
  MC: "Molten Core",
  "Blackwing Lair": "Blackwing Lair",
  BWL: "Blackwing Lair",
  "Temple of Ahn'Qiraj": "Ahn'Qiraj 40",
  "Ahn'Qiraj Temple": "Ahn'Qiraj 40",
  AQ40: "Ahn'Qiraj 40",
  "Ruins of Ahn'Qiraj": "Ruins of Ahn'Qiraj",
  AQ20: "Ruins of Ahn'Qiraj",
  "Naxxramas": "Naxxramas",
  NAXX: "Naxxramas",
  "Zul'Gurub": "Zul'Gurub",
  ZG: "Zul'Gurub",
  "Onyxia's Lair": "Onyxia's Lair"
};

const ALLIANCE_RACES = new Set(["Human", "Dwarf", "NightElf", "Gnome"]);
const HORDE_RACES = new Set(["Orc", "Undead", "Scourge", "Tauren", "Troll"]);

function normalizeRaidName(name) {
  const rawName = String(name || "").trim();
  const baseName = rawName.replace(/\s*\((?:10|20|40) Player\)\s*$/i, "");
  const compactName = baseName.replace(/\s+/g, "").toUpperCase();
  return RAID_NAME_MAP[baseName] || RAID_NAME_MAP[rawName] || RAID_NAME_MAP[compactName] || null;
}

export function parseNovaActiveInstances(luaText) {
  const lines = luaText.split(/\r?\n/);
  const stack = [];
  const results = [];

  const pushContext = (ctx) => {
    stack.push(ctx);
  };

  const popContext = () => {
    const ctx = stack.pop();
    if (ctx?.isInstanceEntry) {
      const raidName = normalizeRaidName(ctx.entry.instanceName);
      if (raidName && ctx.entry.enteredTime && !ctx.entry.leftTime) {
        results.push({
          playerName: ctx.entry.playerName || null,
          raidName,
          enteredTime: ctx.entry.enteredTime
        });
      }
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    const keyedOpen = trimmed.match(/^\["([^"]+)"\]\s*=\s*\{$/);
    if (keyedOpen) {
      pushContext({ key: keyedOpen[1], isInstanceEntry: false });
      return;
    }

    const indexedOpen = trimmed.match(/^\[(\d+)\]\s*=\s*\{$/);
    if (indexedOpen) {
      pushContext({ key: indexedOpen[1], isInstanceEntry: true, entry: { instanceName: null, playerName: null, enteredTime: null, leftTime: null } });
      return;
    }

    if (trimmed === "{" || trimmed.endsWith("= {")) {
      pushContext({ key: null, isInstanceEntry: false });
      return;
    }

    const current = stack[stack.length - 1];
    if (current?.isInstanceEntry) {
      const instanceNameMatch = trimmed.match(/^\["instanceName"\]\s*=\s*"([^"]+)",?$/);
      if (instanceNameMatch) {
        current.entry.instanceName = instanceNameMatch[1];
      }

      const playerNameMatch = trimmed.match(/^\["playerName"\]\s*=\s*"([^"]+)",?$/);
      if (playerNameMatch) {
        current.entry.playerName = playerNameMatch[1];
      }

      const enteredTimeMatch = trimmed.match(/^\["enteredTime"\]\s*=\s*(\d+),?$/);
      if (enteredTimeMatch) {
        current.entry.enteredTime = Number(enteredTimeMatch[1]);
      }

      const leftTimeMatch = trimmed.match(/^\["leftTime"\]\s*=\s*(\d+),?$/);
      if (leftTimeMatch) {
        current.entry.leftTime = Number(leftTimeMatch[1]);
      }
    }

    const closes = (trimmed.match(/}/g) || []).length;
    for (let index = 0; index < closes; index += 1) {
      if (stack.length) {
        popContext();
      }
    }
  });

  const deduped = new Map();
  results.forEach((entry) => {
    const key = `${entry.raidName}|${entry.enteredTime}`;
    if (!deduped.has(key) || (deduped.get(key).enteredTime || 0) < entry.enteredTime) {
      deduped.set(key, entry);
    }
  });

  return [...deduped.values()].sort((a, b) => b.enteredTime - a.enteredTime);
}

export function parseNovaSavedInstances(luaText) {
  const lines = luaText.split(/\r?\n/);
  const stack = [];
  const results = [];

  const pushContext = (ctx) => {
    stack.push(ctx);
  };

  const popContext = () => {
    const ctx = stack.pop();
    if (ctx?.isSavedEntry) {
      const raidName = normalizeRaidName(ctx.entry.name);
      if (ctx.entry.locked && raidName && typeof ctx.entry.resetTime === "number") {
        results.push({
          characterName: ctx.characterName,
          realm: ctx.realm,
          raidName,
          resetDate: new Date(ctx.entry.resetTime * 1000).toISOString()
        });
      }
    }
  };

  const findNearest = (predicate) => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (predicate(stack[index])) {
        return stack[index];
      }
    }
    return null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    const keyedOpen = trimmed.match(/^\["([^"]+)"\]\s*=\s*\{$/);
    if (keyedOpen) {
      const key = keyedOpen[1];
      const parent = stack[stack.length - 1];

      const ctx = {
        key,
        isRealm: false,
        isChar: false,
        isSavedInstances: false,
        isSavedEntry: false
      };

      if (parent?.key === "global") {
        ctx.isRealm = true;
        ctx.realm = key;
      }

      if (parent?.key === "myChars") {
        ctx.isChar = true;
        ctx.characterName = key;
      }

      if (key === "savedInstances") {
        ctx.isSavedInstances = true;
      }

      pushContext(ctx);
      return;
    }

    const indexedOpen = trimmed.match(/^\[(\d+)\]\s*=\s*\{$/);
    if (indexedOpen) {
      const parent = stack[stack.length - 1];
      if (parent?.isSavedInstances) {
        const charCtx = findNearest((item) => item.isChar);
        const realmCtx = findNearest((item) => item.isRealm);

        pushContext({
          key: indexedOpen[1],
          isSavedEntry: true,
          characterName: charCtx?.characterName || null,
          realm: realmCtx?.realm || null,
          entry: {
            name: null,
            locked: false,
            resetTime: null
          }
        });
      } else {
        pushContext({ key: indexedOpen[1] });
      }
      return;
    }

    if (trimmed === "{" || trimmed.endsWith("= {")) {
      pushContext({ key: null });
      return;
    }

    const current = stack[stack.length - 1];
    if (current?.isSavedEntry) {
      const nameMatch = trimmed.match(/^\["name"\]\s*=\s*"([^"]+)",?$/);
      if (nameMatch) {
        current.entry.name = nameMatch[1];
      }

      if (/^\["locked"\]\s*=\s*true,?$/.test(trimmed)) {
        current.entry.locked = true;
      }

      const resetMatch = trimmed.match(/^\["resetTime"\]\s*=\s*(\d+),?$/);
      if (resetMatch) {
        current.entry.resetTime = Number(resetMatch[1]);
      }
    }

    const closes = (trimmed.match(/}/g) || []).length;
    for (let index = 0; index < closes; index += 1) {
      if (stack.length) {
        popContext();
      }
    }
  });

  return results;
}

function inferFaction(raceEnglish) {
  if (ALLIANCE_RACES.has(raceEnglish)) {
    return "Alliance";
  }
  if (HORDE_RACES.has(raceEnglish)) {
    return "Horde";
  }
  return "Unknown";
}

export function parseNovaCharacters(luaText) {
  const lines = luaText.split(/\r?\n/);
  const stack = [];
  const results = [];

  const pushContext = (ctx) => stack.push(ctx);

  const popContext = () => {
    const ctx = stack.pop();
    if (ctx?.isChar && ctx.characterName && ctx.realm) {
      results.push({
        name: ctx.characterName,
        realm: ctx.realm,
        className: ctx.classLocalized || "Unknown",
        faction: inferFaction(ctx.raceEnglish),
        level: typeof ctx.level === "number" ? ctx.level : null,
        restedXp: typeof ctx.restedXp === "number" ? ctx.restedXp : null
      });
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    const keyedOpen = trimmed.match(/^\["([^"]+)"\]\s*=\s*\{$/);
    if (keyedOpen) {
      const key = keyedOpen[1];
      const parent = stack[stack.length - 1];

      const ctx = {
        key,
        isRealm: false,
        isChar: false,
        realm: null,
        characterName: null,
        classLocalized: null,
        raceEnglish: null,
        level: null,
        restedXp: null
      };

      if (parent?.key === "global") {
        ctx.isRealm = true;
        ctx.realm = key;
      }

      if (parent?.key === "myChars") {
        const realmCtx = [...stack].reverse().find((entry) => entry.isRealm);
        ctx.isChar = true;
        ctx.characterName = key;
        ctx.realm = realmCtx?.realm || null;
      }

      pushContext(ctx);
      return;
    }

    if (trimmed === "{" || trimmed.endsWith("= {")) {
      pushContext({ key: null });
      return;
    }

    const current = stack[stack.length - 1];
    if (current?.isChar) {
      const classMatch = trimmed.match(/^\["classLocalized"\]\s*=\s*"([^"]+)",?$/);
      if (classMatch) {
        current.classLocalized = classMatch[1];
      }

      const raceMatch = trimmed.match(/^\["raceEnglish"\]\s*=\s*"([^"]+)",?$/);
      if (raceMatch) {
        current.raceEnglish = raceMatch[1];
      }

      const levelMatch = trimmed.match(/^\["level"\]\s*=\s*(\d+),?$/);
      if (levelMatch) {
        current.level = Number(levelMatch[1]);
      }

      const restedXpMatch = trimmed.match(/^\["restedXP"\]\s*=\s*(\d+),?$/);
      if (restedXpMatch) {
        current.restedXp = Number(restedXpMatch[1]);
      }
    }

    const closes = (trimmed.match(/}/g) || []).length;
    for (let index = 0; index < closes; index += 1) {
      if (stack.length) {
        popContext();
      }
    }
  });

  const deduped = new Map();
  results.forEach((entry) => {
    const key = `${entry.name.toLowerCase()}|${entry.realm.toLowerCase()}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  });

  return [...deduped.values()];
}
