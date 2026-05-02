import { useRef, useEffect, useState, useCallback } from 'react';
import { useOnlineStatus }   from './hooks/useOnlineStatus';
import { useQueue }          from './hooks/useQueue';
import { useServerStatus }   from './hooks/useServerStatus';
import { Camera }            from './components/Camera';
import { ImageQueue }        from './components/ImageQueue';
import { StatusBar }         from './components/StatusBar';
import './App.css';

// ── Keep-alive interval options ───────────────────────────────────────────
const KEEP_ALIVE_OPTIONS = [
  { label: 'Off',  value: 0           },
  { label: '5m',   value: 5  * 60_000 },
  { label: '10m',  value: 10 * 60_000 },
  { label: '20m',  value: 20 * 60_000 },
  { label: '25m',  value: 25 * 60_000 },
];

const EXIF_MODE_KEY = 'camera-pwa:exif-mode';

export default function App() {
  const isOnline = useOnlineStatus();
  const { items, isProcessing, addImage, retryItem, removeItem, clearDone, resetStuck } = useQueue(isOnline);

  // ── Keep-alive preference ─────────────────────────────────────────────────
  const [keepAliveMs, setKeepAliveMs] = useState(() => {
    const stored = localStorage.getItem('camera-pwa:keep-alive-ms');
    return stored !== null ? Number(stored) : 0;
  });
  const handleKeepAliveChange = (val) => {
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

  // ── Capture + save to device (exif mode) ─────────────────────────────────
  const [exifMode, setExifMode] = useState(
    () => localStorage.getItem(EXIF_MODE_KEY) === 'true'
  );
  const toggleExifMode = () => setExifMode(prev => {
    const next = !prev;
    localStorage.setItem(EXIF_MODE_KEY, String(next));
    return next;
  });

  // ── Show filename after capture ───────────────────────────────────────────
  const [showFilenameAfterCapture, setShowFilenameAfterCapture] = useState(
    () => localStorage.getItem('camera-pwa:show-filename') === 'true'
  );
  const toggleShowFilename = () => setShowFilenameAfterCapture(prev => {
    const next = !prev;
    localStorage.setItem('camera-pwa:show-filename', String(next));
    return next;
  });

  // ── Filename reveal modal ─────────────────────────────────────────────────
  const [revealData, setRevealData] = useState(null); // { fileName, blobUrl, isVideo }

  const closeReveal = useCallback(() => {
    setRevealData(prev => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });
  }, []);

  const handleCapture = useCallback((file, fileName, coords) => {
    addImage(file, fileName, coords);
    if (showFilenameAfterCapture) {
      const blobUrl = URL.createObjectURL(file);
      setRevealData({ fileName, blobUrl, isVideo: file.type.startsWith('video/') });
    }
  }, [addImage, showFilenameAfterCapture]);

  const handlePreview = useCallback(({ blob, fileName }) => {
    const blobUrl = URL.createObjectURL(blob);
    setRevealData({ fileName, blobUrl, isVideo: blob.type.startsWith('video/') });
  }, []);

  // ── Settings accordion ────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

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

      {/* ── Filename reveal modal ── */}
      {revealData && (
        <div
          className="reveal-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="File saved"
          onClick={closeReveal}
        >
          <div className="reveal-modal" onClick={e => e.stopPropagation()}>
            {/* media background */}
            {revealData.isVideo ? (
              <video
                className="reveal-modal-bg"
                src={revealData.blobUrl}
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <div
                className="reveal-modal-bg"
                style={{ backgroundImage: `url(${revealData.blobUrl})` }}
                aria-hidden="true"
              />
            )}
            <div className="reveal-modal-content">
              <p className="reveal-modal-label">File saved as</p>
              <p className="reveal-modal-filename">{revealData.fileName}</p>
              <button className="reveal-modal-close" onClick={closeReveal}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        <Camera onCapture={handleCapture} exifMode={exifMode} />

        {/* ── Settings accordion ── */}
        <div className="settings-accordion">
          <button
            className={`settings-accordion-header${settingsOpen ? ' settings-accordion-header--open' : ''}`}
            onClick={() => setSettingsOpen(p => !p)}
            aria-expanded={settingsOpen}
          >
            <span>Settings</span>
            <span className={`settings-accordion-chevron${settingsOpen ? ' settings-accordion-chevron--open' : ''}`}>›</span>
          </button>

          {settingsOpen && (
            <div className="settings-accordion-body">

              {/* Capture + save to device */}
              <div className="exif-toggle-row">
                <label className="exif-toggle-label" htmlFor="exif-toggle">
                  <span className="exif-toggle-text">Capture + save to device</span>
                  <span className="exif-toggle-hint">Photo is also saved to your device storage.</span>
                </label>
                <button
                  id="exif-toggle"
                  role="switch"
                  aria-checked={exifMode}
                  className={`toggle-switch${exifMode ? ' toggle-switch--on' : ''}`}
                  onClick={toggleExifMode}
                  aria-label="Toggle capture and save to device"
                />
              </div>

              {/* Keep server alive */}
              <div className="exif-toggle-row keep-alive-row">
                <label className="exif-toggle-label">
                  <span className="exif-toggle-text">Keep server alive</span>
                  <span className="exif-toggle-hint">Ping interval to prevent dyno sleep.</span>
                </label>
                <div className="keep-alive-pills" role="group" aria-label="Keep-alive interval">
                  {KEEP_ALIVE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`keep-alive-pill${keepAliveMs === opt.value ? ' keep-alive-pill--active' : ''}`}
                      onClick={() => handleKeepAliveChange(opt.value)}
                      aria-pressed={keepAliveMs === opt.value}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-clear uploaded photos */}
              <div className="exif-toggle-row">
                <label className="exif-toggle-label" htmlFor="auto-clear-toggle">
                  <span className="exif-toggle-text">Auto-clear uploaded photos</span>
                  <span className="exif-toggle-hint">Remove completed items from the queue automatically.</span>
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

              {/* Show filename after capture */}
              <div className="exif-toggle-row" style={{ borderBottom: 'none', marginBottom: 0 }}>
                <label className="exif-toggle-label" htmlFor="show-filename-toggle">
                  <span className="exif-toggle-text">Show filename after capture</span>
                  <span className="exif-toggle-hint">Displays the saved filename after every capture, record, or gallery pick.</span>
                </label>
                <button
                  id="show-filename-toggle"
                  role="switch"
                  aria-checked={showFilenameAfterCapture}
                  className={`toggle-switch${showFilenameAfterCapture ? ' toggle-switch--on' : ''}`}
                  onClick={toggleShowFilename}
                  aria-label="Toggle show filename after capture"
                />
              </div>

            </div>
          )}
        </div>

        <ImageQueue
          items={items}
          onRetry={retryItem}
          onRemove={removeItem}
          onClearDone={clearDone}
          onResetStuck={resetStuck}
          onPreview={handlePreview}
        />
      </main>
    </div>
  );
}
