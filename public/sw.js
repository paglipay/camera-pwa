'use strict';

const CACHE = 'camera-pwa-v1';
const APP_SHELL = ['/', '/manifest.json', '/icons/icon.svg'];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET (skip API calls, Vite dev paths, extensions)
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.protocol === 'chrome-extension:'
  ) return;

  if (request.mode === 'navigate') {
    // Navigation: network-first, fall back to cached shell
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Assets: cache-first, populate on miss
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});

// ─── Background Sync ─────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'upload-queue') {
    event.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: false,
  });

  if (windowClients.length > 0) {
    // App is open — tell it to process the queue
    windowClients.forEach(c => c.postMessage({ type: 'PROCESS_QUEUE' }));
  } else {
    // App is closed — process directly in the service worker
    await processQueueInSW();
  }
}

// ─── Inline DB helpers (SW context) ──────────────────────────────────────────
const SW_DB_NAME = 'camera-pwa';
const SW_STORE   = 'images';
// Mirror VITE_UPLOAD_URL — update this if you change the env var
const UPLOAD_URL = self.UPLOAD_URL || '/files/upload';
const API_KEY    = self.UPLOAD_API_KEY || '';

function swOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SW_DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function processQueueInSW() {
  let db;
  try { db = await swOpenDB(); } catch { return; }

  const pending = await new Promise((resolve, reject) => {
    const tx  = db.transaction(SW_STORE, 'readonly');
    const idx = tx.objectStore(SW_STORE).index('status');
    const req = idx.getAll('pending');
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });

  for (const item of pending) {
    try {
      const body = new FormData();
      body.append('file', item.blob, item.fileName);

      const headers = {};
      if (API_KEY) headers['X-API-Key'] = API_KEY;

      const res = await fetch(UPLOAD_URL, { method: 'POST', body, headers });

      if (res.ok) {
        await swUpdateItem(db, item.id, { status: 'done' });
      } else {
        const retries = (item.retries ?? 0) + 1;
        await swUpdateItem(db, item.id, {
          status: retries >= 3 ? 'failed' : 'pending',
          retries,
          error: `HTTP ${res.status}`,
        });
      }
    } catch {
      // Network error → throw so the browser schedules a retry
      throw new Error('Network unavailable during SW sync');
    }
  }
}

function swUpdateItem(db, id, changes) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(SW_STORE, 'readwrite');
    const store = tx.objectStore(SW_STORE);
    const get   = store.get(id);
    get.onsuccess = () => {
      if (!get.result) { resolve(); return; }
      const put = store.put({ ...get.result, ...changes });
      put.onsuccess = () => resolve();
      put.onerror   = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}
