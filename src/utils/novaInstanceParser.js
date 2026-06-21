const RAID_NAME_MAP = {
  "Molten Core": "Molten Core",
  "Blackwing Lair": "Blackwing Lair",
  "Temple of Ahn'Qiraj": "Ahn'Qiraj 40",
  "Ahn'Qiraj Temple": "Ahn'Qiraj 40",
  "Ruins of Ahn'Qiraj": "Ruins of Ahn'Qiraj",
  "Naxxramas": "Naxxramas",
  "Zul'Gurub": "Zul'Gurub",
  "Onyxia's Lair": "Onyxia's Lair"
};

function normalizeRaidName(name) {
  return RAID_NAME_MAP[name] || null;
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
