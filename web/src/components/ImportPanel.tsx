import { useState, type DragEvent } from 'react';
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
  const [dragging, setDragging] = useState(false);

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

  async function load(file: File | undefined) {
    if (!file) return;
    setPgn(await file.text());
    setError(null);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void load(e.dataTransfer.files[0]);
  }

  return (
    <div className={`import-card ${dragging ? 'dragging' : ''}`}>
      <textarea
        aria-label="PGN"
        value={pgn}
        onChange={(e) => {
          setPgn(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && pgn.trim()) void analyze(pgn);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        placeholder={'Paste a PGN, or drop a .pgn file here\n\n[White "…"]\n[Black "…"]\n\n1. e4 e5 2. Nf3 …'}
        spellCheck={false}
        autoFocus
      />
      {error && <p className="import-error">Couldn't read that PGN: {error}</p>}
      <div className="import-actions">
        <label className="button ghost">
          Upload .pgn
          <input type="file" accept=".pgn,text/plain" onChange={(e) => void load(e.target.files?.[0])} hidden />
        </label>
        <button className="ghost" disabled={submitting} onClick={() => analyze(OPERA_GAME_PGN)}>
          Try the Opera Game
        </button>
        <button className="primary" disabled={!pgn.trim() || submitting} onClick={() => analyze(pgn)}>
          {submitting ? 'Importing…' : 'Analyze game'} <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
