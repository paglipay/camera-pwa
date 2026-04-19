const DB_NAME    = 'camera-pwa';
const DB_VERSION = 1;
const STORE      = 'images';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = ({ target }) => {
      const db = target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status',    'status',    { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    req.onsuccess = ({ target }) => { _db = target.result; resolve(_db); };
    req.onerror   = ({ target }) => reject(target.error);
  });
}

export async function dbAdd(blob, fileName, coords = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add({
      blob,
      fileName,
      status:    'pending',
      timestamp: Date.now(),
      retries:   0,
      error:     null,
      lat:       coords?.lat ?? null,
      lon:       coords?.lon ?? null,
    });
    req.onsuccess = () => resolve(req.result); // returns auto-generated id
    req.onerror   = () => reject(req.error);
  });
}

export async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}

export async function dbUpdate(id, changes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get   = store.get(id);
    get.onsuccess = () => {
      if (!get.result) { resolve(null); return; }
      const updated = { ...get.result, ...changes };
      const put     = store.put(updated);
      put.onsuccess = () => resolve(updated);
      put.onerror   = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

/**
 * Reset any items stuck in 'uploading' back to 'pending'.
 * Safe to call on mount — no upload can be in progress before the app starts.
 * Returns the number of items that were reset.
 */
export async function dbResetStuck() {
  const db   = await openDB();
  const all  = await new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });

  const stuck = all.filter(i => i.status === 'uploading');
  if (stuck.length === 0) return 0;

  await Promise.all(stuck.map(item => new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get   = store.get(item.id);
    get.onsuccess = () => {
      if (!get.result) { resolve(); return; }
      const put = store.put({ ...get.result, status: 'pending', error: null });
      put.onsuccess = () => resolve();
      put.onerror   = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  })));

  return stuck.length;
}

export async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
