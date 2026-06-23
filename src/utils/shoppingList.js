function normalize(value) {
  return String(value || "").trim().toLowerCase();
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
      const key = normalize(item.itemName);
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
    .filter(
      (item) =>
        normalize(item.characterName) === normalize(character.name) &&
        normalize(item.realm) === normalize(character.realm)
    )
    .forEach((item) => {
      const key = normalize(item.itemName);
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
