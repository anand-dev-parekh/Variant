import { useState, type ChangeEvent } from 'react';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { OPERA_GAME_PGN, parseGame } from '@variant/chess-core';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

type Props = {
  onCreated: (gameId: Id<'games'>) => void;
};

export function ImportPanel({ onCreated }: Props) {
  const create = useMutation(api.games.create);
  const [pgn, setPgn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function analyze(text: string) {
    setError(null);
    try {
      parseGame(text); // Fail fast on a bad PGN before the round trip.
      setSubmitting(true);
      onCreated(await create({ pgn: text }));
    } catch (err) {
      setError(err instanceof ConvexError ? String(err.data) : err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPgn(await file.text());
    setError(null);
  }

  return (
    <section className="import">
      <h1>Import a game</h1>
      <p className="muted">Paste a PGN from Chess.com, Lichess, or anywhere else.</p>
      <textarea
        value={pgn}
        onChange={(e) => {
          setPgn(e.target.value);
          setError(null);
        }}
        placeholder={'[White "…"]\n[Black "…"]\n\n1. e4 e5 2. Nf3 …'}
        spellCheck={false}
        autoFocus
      />
      {error && <p className="error">Couldn't read that PGN: {error}</p>}
      <div className="import-actions">
        <button className="primary" disabled={!pgn.trim() || submitting} onClick={() => analyze(pgn)}>
          {submitting ? 'Importing…' : 'Analyze'}
        </button>
        <label className="button">
          Upload .pgn
          <input type="file" accept=".pgn,text/plain" onChange={onFile} hidden />
        </label>
        <button className="link" disabled={submitting} onClick={() => analyze(OPERA_GAME_PGN)}>
          Try a sample game
        </button>
      </div>
    </section>
  );
}
