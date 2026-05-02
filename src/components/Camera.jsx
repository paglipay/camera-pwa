import { useRef, useCallback, useState } from 'react';
import { FileNameHelper } from './FileNameHelper';

const SKIP_NAMING_MODAL_KEY = 'camera-pwa:skip-naming-modal';

/** Resolve with { lat, lon } or null within `timeoutMs`. Never throws. */
function getCoords(timeoutMs = 8000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      console.log('[camera] geolocation API not available');
      resolve(null);
      return;
    }
    const timer = setTimeout(() => {
      console.warn('[camera] geolocation timed out');
      resolve(null);
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timer);
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        console.log('[camera] geolocation success →', coords);
        resolve(coords);
      },
      err => {
        clearTimeout(timer);
        console.warn('[camera] geolocation error →', err.message);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 }
    );
  });
}

export function Camera({ onCapture, exifMode }) {
  const cameraInputRef  = useRef(null);
  const videoInputRef   = useRef(null);
  const galleryInputRef = useRef(null);

  const CUSTOM_NAME_KEY = 'camera-pwa:custom-name';
  const [customName, setCustomName] = useState(
    () => localStorage.getItem(CUSTOM_NAME_KEY) ?? ''
  );

  const updateCustomName = useCallback((name) => {
    setCustomName(name);
    localStorage.setItem(CUSTOM_NAME_KEY, name);
  }, []);

  // Tracks per-(baseName+ext) counters to auto-suffix repeated names: 01 → 01A → 01B …
  // Stored as a map { [baseName+ext]: count } so .jpg and .mp4 increment independently.
  // Persisted in localStorage so it survives remounts AND full tab/browser closes.
  // This prevents sending a filename that already exists on the server (which would
  // trigger Flask's collision avoidance and produce 01C_<timestamp>.jpg).
  const NAME_COUNTER_KEY = 'camera-pwa:name-counter';

  const readCounter = () => {
    try {
      const raw = localStorage.getItem(NAME_COUNTER_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      // Migrate old format { baseName, count } → reset to empty map
      if (parsed && typeof parsed.baseName === 'string') return {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeCounter = (value) => {
    try { localStorage.setItem(NAME_COUNTER_KEY, JSON.stringify(value)); } catch {}
  };

  const getNextName = useCallback((baseName, ext) => {
    if (!baseName) return baseName;
    const key = baseName + (ext || '');
    const counters = readCounter();
    const count = counters[key] ?? 0;
    if (count === 0) {
      writeCounter({ ...counters, [key]: 1 });
      return baseName; // first use — no suffix
    }
    // Same base name+ext — append A, B, C …
    const suffix = count <= 26
      ? String.fromCharCode(64 + count) // 1→A, 2→B …
      : String(count);                   // safety fallback beyond Z
    writeCounter({ ...counters, [key]: count + 1 });
    return baseName + suffix;
  }, []);

  // Naming modal state
  const [pendingCapture, setPendingCapture] = useState(null); // { file, coords, ext }
  const [modalName, setModalName]           = useState('');
  const [modalDontShow, setModalDontShow]   = useState(false);

  const saveLocally = useCallback(async (file) => {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return;
      } catch (err) {
        // User cancelled or share failed — fall through to download
        if (err.name === 'AbortError') return;
        console.warn('[camera] share failed, falling back to download →', err.message);
      }
    }
    // Fallback: programmatic download (saves to Downloads on Android/desktop)
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleFile = useCallback(async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const coords = await getCoords();
    const ext = file.name.includes('.')
      ? '.' + file.name.split('.').pop()
      : '';
    const baseName = customName.trim();

    // If no name provided and user hasn't opted out of the naming modal, show it
    if (!baseName && localStorage.getItem(SKIP_NAMING_MODAL_KEY) !== 'true') {
      setPendingCapture({ file, coords, ext });
      setModalName('');
      setModalDontShow(false);
      return;
    }

    const resolvedName = getNextName(baseName, ext);
    const finalName  = resolvedName ? resolvedName + ext : file.name;
    const namedFile  = new File([file], finalName, { type: file.type });
    if (exifMode) await saveLocally(namedFile);
    onCapture(namedFile, finalName, coords);
  }, [customName, exifMode, getNextName, onCapture, saveLocally]);

  const commitCapture = useCallback(async (name) => {
    if (!pendingCapture) return;
    const { file, coords, ext } = pendingCapture;
    const resolvedName = getNextName(name.trim(), ext);
    const finalName = resolvedName ? resolvedName + ext : file.name;
    const namedFile = new File([file], finalName, { type: file.type });
    setPendingCapture(null);
    if (exifMode) await saveLocally(namedFile);
    onCapture(namedFile, finalName, coords);
  }, [pendingCapture, exifMode, getNextName, onCapture, saveLocally]);

  const handleModalName = useCallback(() => {
    if (modalDontShow) localStorage.setItem(SKIP_NAMING_MODAL_KEY, 'true');
    commitCapture(modalName);
  }, [modalDontShow, modalName, commitCapture]);

  const handleModalCancel = useCallback(() => {
    if (modalDontShow) localStorage.setItem(SKIP_NAMING_MODAL_KEY, 'true');
    if (pendingCapture) commitCapture(''); // proceed with original file name
    setPendingCapture(null);
  }, [modalDontShow, pendingCapture, commitCapture]);

  return (
    <div className="camera-container">
      {/* ── Naming modal ─────────────────────────────────────────────── */}
      {pendingCapture && (
        <div className="naming-modal-backdrop" role="dialog" aria-modal="true" aria-label="Name your file">
          <div className="naming-modal">
            <h2 className="naming-modal-title">Name your file</h2>
            <p className="naming-modal-hint">
              No file name was provided. Give your file a name or cancel to keep the original.
            </p>
            <label className="filename-input-label" htmlFor="modal-filename">
              File name
              <span className="filename-input-hint">(optional — extension is kept automatically)</span>
            </label>
            <input
              id="modal-filename"
              type="text"
              className="filename-input"
              placeholder="e.g. site-photo"
              value={modalName}
              onChange={e => setModalName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleModalName()}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <label className="naming-modal-dontshow">
              <input
                type="checkbox"
                checked={modalDontShow}
                onChange={e => setModalDontShow(e.target.checked)}
              />
              Do not show again
            </label>
            <div className="naming-modal-actions">
              <button className="naming-modal-btn naming-modal-btn--cancel" onClick={handleModalCancel}>
                Cancel
              </button>
              <button className="naming-modal-btn naming-modal-btn--name" onClick={handleModalName}>
                Name
              </button>
            </div>
          </div>
        </div>
      )}
      <FileNameHelper onNameChange={updateCustomName} />
      <div className="filename-input-row">
        <label className="filename-input-label" htmlFor="custom-filename">
          File name
          <span className="filename-input-hint">(optional — extension is kept automatically)</span>
        </label>
        <input
          id="custom-filename"
          type="text"
          className="filename-input"
          placeholder="e.g. site-photo"
          value={customName}
          onChange={e => updateCustomName(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="capture-buttons">
        {/* Camera button — behaviour changes based on exifMode; accepts photos and videos */}
        <label className="btn-capture" htmlFor="native-camera" aria-label="Take photo or video">
          <CameraIcon />
          Capture
        </label>
        <input
          id="native-camera"
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          style={{ display: 'none' }}
        />

        {/* Video button — opens native camera locked to video mode */}
        <label className="btn-capture btn-capture--video" htmlFor="native-video" aria-label="Record video">
          <VideoIcon />
          Record
        </label>
        <input
          id="native-video"
          ref={videoInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          onChange={handleFile}
          style={{ display: 'none' }}
        />

        {/* Opens gallery / file picker for photos and videos */}
        <label className="btn-capture btn-capture--secondary" htmlFor="gallery-pick" aria-label="Choose from gallery">
          <GalleryIcon />
          Gallery
        </label>
        <input
          id="gallery-pick"
          ref={galleryInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}

// ── SVG icons ──────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 15.2A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4z"/>
      <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0
               2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9zm3 14a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1
               2-2V5c0-1-1-2-2-2zM5 17l3.5-4.5 2.5 3.01L14.5 11l4.5 6H5z"/>
    </svg>
  );
}
