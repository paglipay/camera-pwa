import { useState, useEffect, useCallback, useRef } from 'react';
import { dbAdd, dbGetAll, dbUpdate, dbDelete } from '../utils/db';
import { uploadImage } from '../utils/upload';

export function useQueue(isOnline) {
  const [items, setItems]           = useState([]);
  const [isProcessing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const isOnlineRef   = useRef(isOnline);

  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  // ── Reload all items from DB ────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const all = await dbGetAll();
    setItems(all.sort((a, b) => a.timestamp - b.timestamp));
  }, []);

  // ── Process every pending item in order ─────────────────────────────────
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setProcessing(true);

    try {
      const all     = await dbGetAll();
      const pending = all.filter(i => i.status === 'pending');

      for (const item of pending) {
        if (!isOnlineRef.current) break; // stop if we went offline mid-run

        // Optimistically mark as uploading in DB + state
        await dbUpdate(item.id, { status: 'uploading' });
        setItems(prev =>
          prev.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i)
        );

        try {
          await uploadImage(item);
          await dbUpdate(item.id, { status: 'done', error: null });
          setItems(prev =>
            prev.map(i => i.id === item.id ? { ...i, status: 'done', error: null } : i)
          );
        } catch (err) {
          const retries   = (item.retries ?? 0) + 1;
          const newStatus = retries >= 3 ? 'failed' : 'pending';
          await dbUpdate(item.id, { status: newStatus, retries, error: err.message });
          setItems(prev =>
            prev.map(i =>
              i.id === item.id
                ? { ...i, status: newStatus, retries, error: err.message }
                : i
            )
          );
        }
      }
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }, []);

  // ── Add a captured image to the queue ───────────────────────────────────
  const addImage = useCallback(async (blob, fileName) => {
    const id = await dbAdd(blob, fileName);
    setItems(prev => [
      ...prev,
      { id, blob, fileName, status: 'pending', timestamp: Date.now(), retries: 0, error: null },
    ]);
    if (isOnlineRef.current) {
      processQueue();
    } else {
      // Register background sync so SW can wake us up when online
      registerBackgroundSync();
    }
  }, [processQueue]);

  // ── Retry a failed item ─────────────────────────────────────────────────
  const retryItem = useCallback(async (id) => {
    await dbUpdate(id, { status: 'pending', retries: 0, error: null });
    setItems(prev =>
      prev.map(i => i.id === id ? { ...i, status: 'pending', retries: 0, error: null } : i)
    );
    if (isOnlineRef.current) processQueue();
  }, [processQueue]);

  // ── Remove a single item ────────────────────────────────────────────────
  const removeItem = useCallback(async (id) => {
    await dbDelete(id);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  // ── Remove all completed items ──────────────────────────────────────────
  const clearDone = useCallback(async () => {
    const done = items.filter(i => i.status === 'done');
    await Promise.all(done.map(i => dbDelete(i.id)));
    setItems(prev => prev.filter(i => i.status !== 'done'));
  }, [items]);

  // ── Load queue on first mount ───────────────────────────────────────────
  useEffect(() => { refresh(); }, [refresh]);

  // ── Process whenever we come online ────────────────────────────────────
  useEffect(() => {
    if (isOnline) processQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // ── Register background sync when going offline with pending items ──────
  useEffect(() => {
    if (!isOnline && items.some(i => i.status === 'pending')) {
      registerBackgroundSync();
    }
  }, [isOnline, items]);

  // ── Listen for SW "PROCESS_QUEUE" message (background sync wake-up) ─────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = ({ data }) => {
      if (data?.type === 'PROCESS_QUEUE') processQueue();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [processQueue]);

  return { items, isProcessing, addImage, retryItem, removeItem, clearDone };
}

function registerBackgroundSync() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
  navigator.serviceWorker.ready
    .then(reg => reg.sync.register('upload-queue'))
    .catch(() => {});
}
