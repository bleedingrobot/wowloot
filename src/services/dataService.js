import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  where
} from "firebase/firestore";
import { db } from "./firebase";

const COLLECTIONS = {
  accounts: "accounts",
  characters: "characters",
  inventoryItems: "inventoryItems",
  raidStatuses: "raidStatuses",
  lootItems: "lootItems"
};

export function subscribeUserCollection(collectionName, uid, callback) {
  if (!db || !uid) {
    callback([]);
    return () => {};
  }

  const q = query(collection(db, collectionName), where("userId", "==", uid));

  return onSnapshot(q, (snapshot) => {
    const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(docs);
  });
}

export function subscribeAllCollection(collectionName, callback) {
  if (!db) {
    callback([]);
    return () => {};
  }

  return onSnapshot(collection(db, collectionName), (snapshot) => {
    const docs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    callback(docs);
  });
}

export function addAccount(uid, battleNetId) {
  return addDoc(collection(db, COLLECTIONS.accounts), {
    userId: uid,
    battleNetId,
    createdAt: new Date().toISOString()
  });
}

export function addCharacter(uid, payload) {
  return addDoc(collection(db, COLLECTIONS.characters), {
    userId: uid,
    ...payload,
    createdAt: new Date().toISOString()
  });
}

export function updateCharacter(characterId, payload) {
  return updateDoc(doc(db, COLLECTIONS.characters, characterId), payload);
}

export function deleteCharacter(characterId) {
  return deleteDoc(doc(db, COLLECTIONS.characters, characterId));
}

export function upsertRaidStatus(uid, payload) {
  const raidKey = payload.raidName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const docId = `${uid}-${payload.characterId}-${raidKey}`;

  return setDoc(doc(db, COLLECTIONS.raidStatuses, docId), {
    userId: uid,
    ...payload,
    updatedAt: new Date().toISOString()
  });
}

export function addLootItem(uid, payload) {
  return addDoc(collection(db, COLLECTIONS.lootItems), {
    userId: uid,
    ...payload,
    createdAt: new Date().toISOString()
  });
}

export function updateLootItem(lootId, payload) {
  return updateDoc(doc(db, COLLECTIONS.lootItems, lootId), payload);
}

export function deleteLootItem(lootId) {
  return deleteDoc(doc(db, COLLECTIONS.lootItems, lootId));
}

export async function replaceInventoryItems(uid, items) {
  if (!db || !uid) {
    return;
  }

  const existing = await getDocs(
    query(collection(db, COLLECTIONS.inventoryItems), where("userId", "==", uid))
  );

  let batch = writeBatch(db);
  let opCount = 0;

  for (const item of existing.docs) {
    batch.delete(item.ref);
    opCount += 1;

    if (opCount === 450) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  batch = writeBatch(db);
  opCount = 0;
  const createdAt = new Date().toISOString();

  for (const item of items) {
    batch.set(doc(collection(db, COLLECTIONS.inventoryItems)), {
      userId: uid,
      ...item,
      createdAt
    });
    opCount += 1;

    if (opCount === 450) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }
}

export async function deleteAllUserData(uid) {
  if (!db || !uid) {
    return;
  }

  const names = Object.values(COLLECTIONS);
  const snapshots = await Promise.all(
    names.map((name) => getDocs(query(collection(db, name), where("userId", "==", uid))))
  );

  let batch = writeBatch(db);
  let opCount = 0;

  for (const snapshot of snapshots) {
    for (const item of snapshot.docs) {
      batch.delete(item.ref);
      opCount += 1;

      if (opCount === 450) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }
}

export { COLLECTIONS };
