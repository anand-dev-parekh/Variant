import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

/**
 * Delete a game, after a confirm step in place: "Delete" turns into "Delete this game? Delete ·
 * Cancel". Deleting removes the what-ifs and chats too, and can't be undone. `compact` shows a
 * trash icon instead of the word, for list rows.
 */
export function DeleteGame({ gameId, onDeleted, compact }: { gameId: Id<'games'>; onDeleted?: () => void; compact?: boolean }) {
  const remove = useMutation(api.games.remove);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await remove({ gameId });
      onDeleted?.();
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : 'Could not delete. Try again.');
      setDeleting(false);
    }
  };

  if (!confirming) {
    return (
      <button
        className={`ghost delete-game ${compact ? 'compact' : ''}`}
        onClick={() => setConfirming(true)}
        aria-label={compact ? 'Delete game' : undefined}
        title={compact ? 'Delete game' : undefined}
      >
        {compact ? (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          'Delete'
        )}
      </button>
    );
  }
  return (
    <div className="delete-confirm" role="group" aria-label="Confirm delete">
      <span>{compact ? 'Delete this game?' : 'Delete this game, with its what-ifs and chats?'}</span>
      <button className="danger-solid" onClick={() => void confirm()} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
      <button className="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
        Cancel
      </button>
      {error && <span className="import-error">{error}</span>}
    </div>
  );
}
