import { useRef, useCallback } from 'react';

export function Camera({ onCapture }) {
  const cameraInputRef  = useRef(null);
  const galleryInputRef = useRef(null);

  const handleFile = useCallback(e => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file, file.name);
      e.target.value = '';
    }
  }, [onCapture]);

  return (
    <div className="camera-container">
      <div className="capture-buttons">
        {/* Opens native Android/iOS camera app */}
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
