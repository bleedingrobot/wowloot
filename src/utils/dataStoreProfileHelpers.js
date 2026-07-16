function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function profileKey(name, realm) {
  return `${normalize(name)}|${normalize(realm)}`;
}

export function detectDataStoreSourceType(fileName, text) {
  const name = normalize(fileName);
  const body = String(text || "");

  if (name.includes("datastore_containers")) {
    return "containers";
  }
  if (name.includes("datastore_inventory")) {
    return "inventory";
  }
  if (name.includes("datastore_characters")) {
    return "characters";
  }

  if (body.includes("DataStore_ContainersDB")) {
    return "containers";
  }
  if (body.includes("DataStore_Containers_Characters")) {
    return "containers";
  }
  if (body.includes("DataStore_InventoryDB")) {
    return "inventory";
  }
  if (body.includes("DataStore_Inventory_Characters")) {
    return "inventory";
  }
  if (body.includes("DataStore_CharactersDB")) {
    return "characters";
  }
  if (body.includes("DataStore_Characters_Info")) {
    return "characters";
  }

  return "unknown";
}

export function mergeInventoryProfiles(entries) {
  const byKey = new Map();

  entries.forEach((entry) => {
    const key = profileKey(entry.characterName, entry.realm);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, entry);
      return;
    }

    const existingStamp = Number(existing.lastInventoryUpdate || 0);
    const incomingStamp = Number(entry.lastInventoryUpdate || 0);
    if (incomingStamp >= existingStamp) {
      byKey.set(key, entry);
    }
  });

  return [...byKey.values()];
}

export function mergeCharacterProfiles(entries) {
  const byKey = new Map();

  entries.forEach((entry) => {
    const key = profileKey(entry.characterName, entry.realm);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, entry);
      return;
    }

    const existingStamp = Number(existing.lastCharacterUpdate || existing.lastLogoutTimestamp || 0);
    const incomingStamp = Number(entry.lastCharacterUpdate || entry.lastLogoutTimestamp || 0);
    if (incomingStamp >= existingStamp) {
      byKey.set(key, entry);
    }
  });

  return [...byKey.values()];
}

export function characterProfileKey(name, realm) {
  return profileKey(name, realm);
}
