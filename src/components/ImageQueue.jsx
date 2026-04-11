import { useEffect, useState } from 'react';

const STATUS_LABEL = {
  pending:   'Queued',
  uploading: 'Uploading…',
  done:      'Uploaded',
  failed:    'Failed',
};

export function ImageQueue({ items, onRetry, onRemove, onClearDone, autoClear, onToggleAutoClear }) {
  if (items.length === 0) return null;

  const counts = items.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {});
  const hasDone = (counts.done ?? 0) > 0;

  return (
    <section className="queue-section" aria-label="Upload queue">
      <div className="queue-header">
        <h2 className="queue-title">
          Queue
          <span className="queue-count">{items.length}</span>
        </h2>

        <div className="queue-badges">
          {counts.pending   > 0 && <span className="badge badge-pending">{counts.pending} pending</span>}
          {counts.uploading > 0 && <span className="badge badge-uploading">{counts.uploading} uploading</span>}
          {counts.done      > 0 && <span className="badge badge-done">{counts.done} done</span>}
          {counts.failed    > 0 && <span className="badge badge-failed">{counts.failed} failed</span>}
        </div>

        <label className="auto-clear-label">
          <input
            type="checkbox"
            checked={autoClear}
            onChange={onToggleAutoClear}
            aria-label="Auto-clear uploaded photos"
          />
          Auto-clear
        </label>

        {hasDone && !autoClear && (
          <button className="btn-text" onClick={onClearDone} aria-label="Clear uploaded photos">
            Clear done
          </button>
        )}
      </div>

      <ul className="queue-list" role="list">
        {items.map(item => (
          <QueueItem key={item.id} item={item} onRetry={onRetry} onRemove={onRemove} />
        ))}
      </ul>
    </section>
  );
}

function QueueItem({ item, onRetry, onRemove }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    const url = URL.createObjectURL(item.blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [item.blob]);

  const canRemove = item.status === 'done' || item.status === 'failed';

  return (
    <li className={`queue-item status-${item.status}`} aria-label={item.fileName}>
      <div className="qi-thumb">
        {src && <img src={src} alt="" loading="lazy" />}
      </div>

      <div className="qi-info">
        <span className="qi-name">{item.fileName}</span>
        <span className="qi-time">{new Date(item.timestamp).toLocaleTimeString()}</span>
        <span className={`qi-status qi-status--${item.status}`}>
          {item.status === 'uploading' && <span className="spinner" aria-hidden="true" />}
          {STATUS_LABEL[item.status]}
          {item.retries > 0 && item.status !== 'done' && (
            <span className="qi-retries"> · retry {item.retries}/3</span>
          )}
        </span>
        {item.error && <span className="qi-error">{item.error}</span>}
      </div>

      <div className="qi-actions">
        {item.status === 'failed' && (
          <button className="btn-small" onClick={() => onRetry(item.id)}>
            Retry
          </button>
        )}
        {canRemove && (
          <button
            className="btn-small btn-small--danger"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.fileName}`}
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}
