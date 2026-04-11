export function StatusBar({ isOnline, isProcessing, pendingCount }) {
  return (
    <div className={`status-bar ${isOnline ? 'status-bar--online' : 'status-bar--offline'}`}
         role="status"
         aria-live="polite">
      <div className="status-indicator">
        <span className="status-dot" aria-hidden="true" />
        <span>{isOnline ? 'Online' : 'Offline'}</span>
      </div>

      {pendingCount > 0 && (
        <span className="status-info">
          {pendingCount} photo{pendingCount !== 1 ? 's' : ''} queued
          {isOnline && isProcessing && <> · uploading…</>}
          {!isOnline && <> · will upload when online</>}
        </span>
      )}
    </div>
  );
}
