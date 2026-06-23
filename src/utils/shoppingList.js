function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeItemKey(value) {
  return normalize(value)
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}

function isCharacterMatch(inventoryItem, character) {
  const itemName = normalize(inventoryItem.characterName);
  const charName = normalize(character.name);
  if (!itemName || !charName || itemName !== charName) {
    return false;
  }

  const itemRealm = normalize(inventoryItem.realm);
  const charRealm = normalize(character.realm);

  // Some imports (especially Bagnon-style) may not include realm details.
  // If either side is blank, fall back to character-name matching.
  if (!itemRealm || !charRealm) {
    return true;
  }

  return itemRealm === charRealm;
}

export function computeShoppingNeeds(character, profiles, inventoryItems) {
  const matchingProfiles = profiles.filter(
    (profile) => normalize(profile.className) === normalize(character.class) || profile.className === "All"
  );

  if (!matchingProfiles.length) {
    return [];
  }

  // Merge requirements across all matching profiles, taking the highest quantity for each item
  const required = new Map();
  matchingProfiles.forEach((profile) => {
    (profile.items || []).forEach((item) => {
      const key = normalizeItemKey(item.itemName);
      if (!key) {
        return;
      }
      const existing = required.get(key);
      if (!existing || item.quantity > existing.quantity) {
        required.set(key, { itemName: item.itemName, quantity: Number(item.quantity) || 1 });
      }
    });
  });

  if (!required.size) {
    return [];
  }

  // Sum what this character actually has across all bags and bank
  const haveCounts = new Map();
  inventoryItems
    .filter((item) => isCharacterMatch(item, character))
    .forEach((item) => {
      const key = normalizeItemKey(item.itemName);
      haveCounts.set(key, (haveCounts.get(key) || 0) + (item.count || 1));
    });

  const needs = [];
  required.forEach(({ itemName, quantity }, key) => {
    const have = haveCounts.get(key) || 0;
    if (have < quantity) {
      needs.push({ itemName, required: quantity, have, need: quantity - have });
    }
  });

  return needs.sort((a, b) => a.itemName.localeCompare(b.itemName));
}
