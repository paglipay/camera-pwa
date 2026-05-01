export function StatusBar({ isOnline, isProcessing, pendingCount, waking, serverReady }) {
  return (
    <>
      {/* ── Wakeup banner ── */}
      {waking && (
        <div className="wakeup-banner" role="status" aria-live="polite">
          <span className="wakeup-spinner" aria-hidden="true" />
          <span>Server waking up — please wait before taking a photo…</span>
        </div>
      )}

      {/* ── Normal status bar ── */}
      <div
        className={`status-bar ${isOnline ? 'status-bar--online' : 'status-bar--offline'}`}
        role="status"
        aria-live="polite"
      >
        <div className="status-indicator">
          <span className="status-dot" aria-hidden="true" />
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Show "ready" confirmation briefly after wakeup, or queue info */}
        {!waking && serverReady && pendingCount === 0 && !isProcessing ? null : (
          <span className="status-info">
            {pendingCount > 0 && (
              <>
                {pendingCount} photo{pendingCount !== 1 ? 's' : ''} queued
                {isOnline && isProcessing && <> · uploading…</>}
                {!isOnline && <> · will upload when online</>}
              </>
            )}
          </span>
        )}
      </div>
    </>
  );
}
