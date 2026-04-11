import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useQueue }        from './hooks/useQueue';
import { Camera }          from './components/Camera';
import { ImageQueue }      from './components/ImageQueue';
import { StatusBar }       from './components/StatusBar';
import './App.css';

export default function App() {
  const isOnline = useOnlineStatus();
  const { items, isProcessing, addImage, retryItem, removeItem, clearDone } = useQueue(isOnline);

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
