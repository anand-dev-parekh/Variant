import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

/**
 * Delete a game, after a confirm step in place: "Delete" turns into "Delete this game? Delete ·
 * Cancel". Deleting removes the what-ifs and chats too, and can't be undone.
 */
export function DeleteGame({ gameId, onDeleted }: { gameId: Id<'games'>; onDeleted?: () => void }) {
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
      <button className="ghost delete-game" onClick={() => setConfirming(true)}>
        Delete
      </button>
    );
  }
  return (
    <div className="delete-confirm" role="group" aria-label="Confirm delete">
      <span>Delete this game, with its what-ifs and chats?</span>
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
