import { useRef, useCallback, useState } from 'react';

const EXIF_MODE_KEY = 'camera-pwa:exif-mode';

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

export function Camera({ onCapture }) {
  const cameraInputRef  = useRef(null);
  const galleryInputRef = useRef(null);

  // When exifMode is true the camera button opens the file picker (no `capture`
  // attribute) so the user picks an already-saved photo which retains EXIF data.
  const [exifMode, setExifMode] = useState(
    () => localStorage.getItem(EXIF_MODE_KEY) === 'true'
  );

  const toggleExifMode = useCallback(() => {
    setExifMode(prev => {
      const next = !prev;
      localStorage.setItem(EXIF_MODE_KEY, String(next));
      return next;
    });
  }, []);

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
    if (exifMode) await saveLocally(file);
    onCapture(file, file.name, coords);
  }, [exifMode, onCapture, saveLocally]);

  return (
    <div className="camera-container">
      <div className="exif-toggle-row">
        <label className="exif-toggle-label" htmlFor="exif-toggle">
          <span className="exif-toggle-text">
            {exifMode ? 'Capture + save to device' : 'Upload only'}
          </span>
          <span className="exif-toggle-hint">
            {exifMode
              ? 'Photo is captured and also saved to your device storage'
              : 'Photo is captured and uploaded without saving to device'}
          </span>
        </label>
        <button
          id="exif-toggle"
          role="switch"
          aria-checked={exifMode}
          className={`toggle-switch${exifMode ? ' toggle-switch--on' : ''}`}
          onClick={toggleExifMode}
          aria-label="Toggle EXIF mode"
        />
      </div>

      <div className="capture-buttons">
        {/* Camera button — behaviour changes based on exifMode */}
        <label className="btn-capture" htmlFor="native-camera" aria-label="Take photo">
          <CameraIcon />
          Take Photo
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

        {/* Opens photo gallery / file picker */}
        <label className="btn-capture btn-capture--secondary" htmlFor="gallery-pick" aria-label="Choose from gallery">
          <GalleryIcon />
          Gallery
        </label>
        <input
          id="gallery-pick"
          ref={galleryInputRef}
          type="file"
          accept="image/*"
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

function GalleryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1
               2-2V5c0-1-1-2-2-2zM5 17l3.5-4.5 2.5 3.01L14.5 11l4.5 6H5z"/>
    </svg>
  );
}
