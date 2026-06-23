const NIT_HANDLE_DB = "wowloot-nit-handles";
const NIT_HANDLE_STORE = "handles";
const NIT_HANDLE_KEY = "nova-files";
const NIT_CONNECTED_FILE_META_KEY = "nit_connected_file_meta";

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NIT_HANDLE_DB, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NIT_HANDLE_STORE)) {
        db.createObjectStore(NIT_HANDLE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveConnectedHandles(handles) {
  const db = await openHandleDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(NIT_HANDLE_STORE, "readwrite");
    tx.objectStore(NIT_HANDLE_STORE).put(handles, NIT_HANDLE_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadConnectedHandles() {
  const db = await openHandleDb();
  const handles = await new Promise((resolve, reject) => {
    const tx = db.transaction(NIT_HANDLE_STORE, "readonly");
    const req = tx.objectStore(NIT_HANDLE_STORE).get(NIT_HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handles;
}

async function hasSameEntry(handleA, handleB) {
  if (typeof handleA?.isSameEntry !== "function") {
    return false;
  }

  try {
    return await handleA.isSameEntry(handleB);
  } catch {
    return false;
  }
}

export async function mergeConnectedHandles(existingHandles, newHandles) {
  const merged = [...existingHandles];

  for (const nextHandle of newHandles) {
    let exists = false;

    for (const currentHandle of merged) {
      if (await hasSameEntry(currentHandle, nextHandle)) {
        exists = true;
        break;
      }
    }

    if (!exists) {
      merged.push(nextHandle);
    }
  }

  return merged;
}

export function readConnectedFileMeta() {
  try {
    const raw = localStorage.getItem(NIT_CONNECTED_FILE_META_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConnectedFileMeta(meta) {
  localStorage.setItem(NIT_CONNECTED_FILE_META_KEY, JSON.stringify(meta));
}

export function buildConnectedFileEntries(handles, meta = [], selectedIndexes = []) {
  const selectedSet = new Set(selectedIndexes);
  const hasSelection = selectedSet.size > 0;

  return handles.map((handle, index) => ({
    id: `${handle?.name || "file"}-${index}`,
    name: handle?.name || "Unknown file",
    fileName: meta[index]?.fileName || handle?.name || "Unknown file",
    selected: hasSelection ? selectedSet.has(index) : true,
    accountName: meta[index]?.accountName || "",
    handle
  }));
}