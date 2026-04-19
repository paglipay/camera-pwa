import { useRef, useEffect, useState } from 'react';
import { useOnlineStatus }   from './hooks/useOnlineStatus';
import { useQueue }          from './hooks/useQueue';
import { useServerStatus }   from './hooks/useServerStatus';
import { Camera }            from './components/Camera';
import { ImageQueue }        from './components/ImageQueue';
import { StatusBar }         from './components/StatusBar';
import './App.css';

// ── Keep-alive interval options ───────────────────────────────────────────
const KEEP_ALIVE_OPTIONS = [
  { label: 'Off',          value: 0           },
  { label: 'Every 5 min',  value: 5  * 60_000 },
  { label: 'Every 10 min', value: 10 * 60_000 },
  { label: 'Every 20 min', value: 20 * 60_000 },
  { label: 'Every 25 min', value: 25 * 60_000 },
];

export default function App() {
  const isOnline = useOnlineStatus();
  const { items, isProcessing, addImage, retryItem, removeItem, clearDone, resetStuck } = useQueue(isOnline);

  // ── Keep-alive preference ─────────────────────────────────────────────────
  const [keepAliveMs, setKeepAliveMs] = useState(() => {
    const stored = localStorage.getItem('camera-pwa:keep-alive-ms');
    return stored !== null ? Number(stored) : 0;
  });
  const handleKeepAliveChange = (e) => {
    const val = Number(e.target.value);
    setKeepAliveMs(val);
    localStorage.setItem('camera-pwa:keep-alive-ms', String(val));
  };

  // ── Server wakeup detection + keep-alive pings ────────────────────────────
  const { serverReady, waking } = useServerStatus(keepAliveMs);

  // ── Auto-clear preference ─────────────────────────────────────────────────
  const [autoClear, setAutoClear] = useState(
    () => localStorage.getItem('camera-pwa:auto-clear') === 'true'
  );
  const toggleAutoClear = () => setAutoClear(prev => {
    const next = !prev;
    localStorage.setItem('camera-pwa:auto-clear', String(next));
    return next;
  });

  const clearDoneRef = useRef(clearDone);
  useEffect(() => { clearDoneRef.current = clearDone; }, [clearDone]);

  const wasProcessingRef = useRef(false);
  useEffect(() => {
    if (wasProcessingRef.current && !isProcessing && autoClear) {
      clearDoneRef.current();
    }
    wasProcessingRef.current = isProcessing;
  }, [isProcessing, autoClear]);

  const pendingCount = items.filter(i => i.status === 'pending' || i.status === 'uploading').length;

  return (
    <div className="app">
      <StatusBar
        isOnline={isOnline}
        isProcessing={isProcessing}
        pendingCount={pendingCount}
        waking={waking}
        serverReady={serverReady}
      />

      <main className="main">
        <Camera onCapture={addImage} />

        {/* ── Auto-clear toggle ── */}
        <div className="exif-toggle-row">
          <label className="exif-toggle-label" htmlFor="auto-clear-toggle">
            <span className="exif-toggle-text">Auto-clear uploaded photos</span>
          </label>
          <button
            id="auto-clear-toggle"
            role="switch"
            aria-checked={autoClear}
            className={`toggle-switch${autoClear ? ' toggle-switch--on' : ''}`}
            onClick={toggleAutoClear}
            aria-label="Toggle auto-clear"
          />
        </div>

        {/* ── Keep-alive selector ── */}
        <div className="exif-toggle-row keep-alive-row">
          <label className="exif-toggle-label" htmlFor="keep-alive-select">
            <span className="exif-toggle-text">Keep server alive</span>
            <span className="exif-toggle-hint">
              Pings the server on an interval to prevent dyno sleep.
            </span>
          </label>
          <select
            id="keep-alive-select"
            className="keep-alive-select"
            value={keepAliveMs}
            onChange={handleKeepAliveChange}
            aria-label="Keep-alive interval"
          >
            {KEEP_ALIVE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <ImageQueue
          items={items}
          onRetry={retryItem}
          onRemove={removeItem}
          onClearDone={clearDone}
          onResetStuck={resetStuck}
        />
      </main>
    </div>
  );
}
