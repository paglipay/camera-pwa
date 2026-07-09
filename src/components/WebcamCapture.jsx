import { useRef, useCallback, useState, useEffect } from 'react';
import { FileNameHelper } from './FileNameHelper';
import { getHeading } from '../utils/heading';

// ── Helpers shared with Camera.jsx (same localStorage keys) ─────────────────

/** Resolve with { lat, lon } or null within `timeoutMs`. Never throws. */
function getCoords(timeoutMs = 8000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      err => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 }
    );
  });
}

const NAME_COUNTER_KEY = 'camera-pwa:name-counter';
const CUSTOM_NAME_KEY  = 'camera-pwa:custom-name';

function readCounter() {
  try {
    const raw    = localStorage.getItem(NAME_COUNTER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed.baseName === 'string') return {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeCounter(value) {
  try { localStorage.setItem(NAME_COUNTER_KEY, JSON.stringify(value)); } catch {}
}

function getSupportedMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
}

function formatTime(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function WebcamCapture({ onCapture, exifMode }) {
  const videoRef    = useRef(null);
  const streamRef   = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const canvasRef   = useRef(null); // lazily created

  const [devices,     setDevices]     = useState([]);
  const [deviceId,    setDeviceId]    = useState('');
  const [isReady,     setIsReady]     = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds,  setRecSeconds]  = useState(0);
  const [error,       setError]       = useState(null);

  const [customName, setCustomName] = useState(
    () => localStorage.getItem(CUSTOM_NAME_KEY) ?? ''
  );

  const updateCustomName = useCallback((name) => {
    setCustomName(name);
    localStorage.setItem(CUSTOM_NAME_KEY, name);
  }, []);

  const getNextName = useCallback((baseName, ext) => {
    if (!baseName) return baseName;
    const key      = baseName + (ext || '');
    const counters = readCounter();
    const count    = counters[key] ?? 0;
    if (count === 0) {
      writeCounter({ ...counters, [key]: 1 });
      return baseName;
    }
    const suffix = count <= 26 ? String.fromCharCode(64 + count) : String(count);
    writeCounter({ ...counters, [key]: count + 1 });
    return baseName + suffix;
  }, []);

  const saveLocally = useCallback(async (file) => {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Camera stream management ─────────────────────────────────────────────

  const startCamera = useCallback(async (targetDeviceId) => {
    setError(null);
    setIsReady(false);

    // Stop any existing stream
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    try {
      const constraints = {
        video: targetDeviceId ? { deviceId: { exact: targetDeviceId } } : true,
        audio: true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Enumerate after permission so we get device labels
      const all  = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter(d => d.kind === 'videoinput');
      setDevices(vids);

      // Track which device is actually active
      if (!targetDeviceId) {
        const activeId = stream.getVideoTracks()[0]?.getSettings()?.deviceId;
        setDeviceId(activeId ?? vids[0]?.deviceId ?? '');
      }

      setIsReady(true);
    } catch (err) {
      setError(err.message ?? 'Camera access denied.');
    }
  }, []);

  // Start camera on mount; stop on unmount
  useEffect(() => {
    startCamera(undefined);
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-enumerate if a device is plugged in / unplugged
  useEffect(() => {
    const handler = async () => {
      const all  = await navigator.mediaDevices.enumerateDevices();
      const vids = all.filter(d => d.kind === 'videoinput');
      setDevices(vids);
    };
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, []);

  const handleDeviceChange = (newDeviceId) => {
    setDeviceId(newDeviceId);
    startCamera(newDeviceId);
  };

  // ── Recording timer ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRecording) { setRecSeconds(0); return; }
    const id = setInterval(() => setRecSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  // ── Snapshot ─────────────────────────────────────────────────────────────

  const handleSnapshot = useCallback(async () => {
    if (!isReady || !videoRef.current) return;
    const video = videoRef.current;

    // Lazily create offscreen canvas
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas    = canvasRef.current;
    canvas.width    = video.videoWidth;
    canvas.height   = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    const [coords, heading] = await Promise.all([getCoords(), getHeading()]);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const ext          = '.jpg';
      const baseName     = customName.trim();
      const resolvedName = getNextName(baseName, ext);
      const finalName    = resolvedName ? resolvedName + ext : `webcam-${Date.now()}${ext}`;
      const file         = new File([blob], finalName, { type: 'image/jpeg' });
      if (exifMode) await saveLocally(file);
      onCapture(file, finalName, coords, heading);
    }, 'image/jpeg', 0.92);
  }, [isReady, customName, exifMode, getNextName, saveLocally, onCapture]);

  // ── Video recording ──────────────────────────────────────────────────────

  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      // isRecording cleared in onstop
    } else {
      if (!streamRef.current) return;
      chunksRef.current = [];

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType } : undefined
      );

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        const usedMime = recorder.mimeType || 'video/webm';
        const blob     = new Blob(chunksRef.current, { type: usedMime });
        chunksRef.current = [];

        const ext          = usedMime.includes('mp4') ? '.mp4' : '.webm';
        const [coords, heading] = await Promise.all([getCoords(), getHeading()]);
        const baseName     = customName.trim();
        const resolvedName = getNextName(baseName, ext);
        const finalName    = resolvedName ? resolvedName + ext : `webcam-${Date.now()}${ext}`;
        const file         = new File([blob], finalName, { type: usedMime });
        if (exifMode) await saveLocally(file);
        onCapture(file, finalName, coords, heading);
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    }
  }, [isRecording, customName, exifMode, getNextName, saveLocally, onCapture]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="webcam-container">
      <div className="webcam-layout">

        {/* ── Left: live viewfinder ── */}
        <div className="webcam-panel-video">
          <div className="webcam-preview-wrapper">
            {error ? (
              <div className="webcam-error">
                <p className="webcam-error-title">Camera unavailable</p>
                <p className="webcam-error-detail">{error}</p>
                <button className="btn-capture" onClick={() => startCamera(deviceId || undefined)}>
                  Retry
                </button>
              </div>
            ) : (
              <video
                ref={videoRef}
                className="webcam-video"
                autoPlay
                muted
                playsInline
              />
            )}

            {isRecording && (
              <div className="webcam-rec-badge" aria-label={`Recording — ${formatTime(recSeconds)}`}>
                <span className="webcam-rec-dot" aria-hidden="true" />
                REC&nbsp;{formatTime(recSeconds)}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: controls panel ── */}
        <div className="webcam-panel-controls">
          <FileNameHelper onNameChange={updateCustomName} />

          <div className="filename-input-row">
            <label className="filename-input-label" htmlFor="webcam-filename">
              File name
              <span className="filename-input-hint">(optional — extension is kept automatically)</span>
            </label>
            <input
              id="webcam-filename"
              type="text"
              className="filename-input"
              placeholder="e.g. site-photo"
              value={customName}
              onChange={e => updateCustomName(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {devices.length > 1 && (
            <div className="webcam-device-row">
              <label className="webcam-device-label" htmlFor="webcam-device-select">
                Camera source
              </label>
              <select
                id="webcam-device-select"
                className="webcam-device-select"
                value={deviceId}
                onChange={e => handleDeviceChange(e.target.value)}
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="capture-buttons">
            <button
              className="btn-capture"
              onClick={handleSnapshot}
              disabled={!isReady || isRecording}
              aria-label="Take snapshot"
            >
              <SnapIcon />
              Snap
            </button>

            <button
              className={`btn-capture${isRecording ? ' btn-capture--stop' : ' btn-capture--video'}`}
              onClick={handleRecordToggle}
              disabled={!isReady}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? <StopIcon /> : <VideoIcon />}
              {isRecording ? `Stop  ${formatTime(recSeconds)}` : 'Record'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function SnapIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  );
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    </svg>
  );
}
