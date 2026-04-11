import { useRef, useState, useEffect, useCallback } from 'react';

export function Camera({ onCapture }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const fileInputRef = useRef(null);

  const [facingMode,   setFacingMode]   = useState('environment');
  const [isReady,      setReady]        = useState(false);
  const [cameraError,  setCameraError]  = useState(null);
  const [isFlashing,   setFlashing]     = useState(false);

  // ── Start / restart the camera ─────────────────────────────────────────
  const startCamera = useCallback(async (mode) => {
    setReady(false);
    setCameraError(null);

    // Stop any existing tracks first
    streamRef.current?.getTracks().forEach(t => t.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      const msgs = {
        NotAllowedError:  'Camera access denied. Please allow camera permissions and reload.',
        NotFoundError:    'No camera detected on this device.',
        NotReadableError: 'Camera is in use by another app.',
      };
      setCameraError(msgs[err.name] ?? 'Camera unavailable — use the gallery button below.');
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const handleVideoReady = () => setReady(true);

  // ── Capture frame from video ───────────────────────────────────────────
  const capture = useCallback(() => {
    if (!isReady || !videoRef.current || !canvasRef.current) return;

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    setFlashing(true);
    setTimeout(() => setFlashing(false), 200);

    canvas.toBlob(blob => {
      if (blob) onCapture(blob, `photo-${Date.now()}.jpg`);
    }, 'image/jpeg', 0.88);
  }, [isReady, onCapture]);

  // ── Keyboard shortcut (Space / Enter) ─────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if ((e.code === 'Space' || e.code === 'Enter') && isReady) capture();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capture, isReady]);

  // ── File input fallback ────────────────────────────────────────────────
  const handleFileInput = useCallback(e => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file, file.name);
      e.target.value = '';
    }
  }, [onCapture]);

  const toggleCamera = () =>
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));

  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="camera-container">
      {cameraError ? (
        <div className="camera-error">
          <CameraOffIcon />
          <p>{cameraError}</p>
          <label className="btn btn-primary" htmlFor="file-capture-fallback">
            Open Gallery
          </label>
          <input
            id="file-capture-fallback"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInput}
            ref={fileInputRef}
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        <>
          <div className={`video-wrapper${isFlashing ? ' flash' : ''}`}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="video-preview"
              onCanPlay={handleVideoReady}
            />
            {!isReady && (
              <div className="video-loading">
                <div className="loading-ring" />
              </div>
            )}
          </div>

          <div className="camera-controls">
            {/* Flip camera */}
            <button
              className="btn-icon"
              onClick={toggleCamera}
              aria-label="Flip camera"
            >
              <FlipIcon />
            </button>

            {/* Shutter */}
            <button
              className="btn-shutter"
              onClick={capture}
              disabled={!isReady}
              aria-label="Take photo"
            >
              <span className="shutter-inner" />
            </button>

            {/* Gallery / file picker */}
            <label className="btn-icon" htmlFor="file-gallery" aria-label="Choose from gallery">
              <GalleryIcon />
              <input
                id="file-gallery"
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true" />
    </div>
  );
}

// ── SVG icons ──────────────────────────────────────────────────────────────

function FlipIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9
               2-2V7c0-1.1-.9-2-2-2zm-9 11V8l5.5 4-5.5 4z"/>
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1
               2-2V5c0-1-1-2-2-2zM5 17l3.5-4.5 2.5 3.01L14.5 11l4.5 6H5z"/>
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
         style={{ opacity: 0.5, marginBottom: '0.5rem' }}>
      <path d="M21.9 21.9 2.1 2.1 .69 3.51 3 5.83V19c0 1.1.9 2 2 2h14.17l2.31 2.31
               1.42-1.41zM5 19V7.83l1 1V19H5zm5.06-5.06L8.4 12.28A3.5 3.5 0 0 0 12
               15.5c.21 0 .41-.02.61-.06L11.5 14.33c-.16.1-.32.17-.5.17-.55
               0-1-.45-1-1 0-.18.07-.34.17-.5l.89.89zM12 5c-3.87 0-7 3.13-7 7s3.13
               7 7 7a7 7 0 0 0 7-7 7 7 0 0 0-7-7zm0 2a5.007 5.007 0 0 1 5 5
               5.007 5.007 0 0 1-5 5 5.007 5.007 0 0 1-5-5 5.007 5.007 0 0 1 5-5z"/>
    </svg>
  );
}
