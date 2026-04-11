import { useRef, useEffect, useState } from 'react';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useQueue }        from './hooks/useQueue';
import { Camera }          from './components/Camera';
import { ImageQueue }      from './components/ImageQueue';
import { StatusBar }       from './components/StatusBar';
import './App.css';

export default function App() {
  const isOnline = useOnlineStatus();
  const { items, isProcessing, addImage, retryItem, removeItem, clearDone } = useQueue(isOnline);

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
      />

      <main className="main">
        <Camera onCapture={addImage} />
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
        <ImageQueue
          items={items}
          onRetry={retryItem}
          onRemove={removeItem}
          onClearDone={clearDone}
        />
      </main>
    </div>
  );
}
