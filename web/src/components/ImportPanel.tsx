import { useState, type ChangeEvent } from 'react';
import { OPERA_GAME_PGN, parseGame, type ParsedGame } from '@variant/chess-core';

type Props = {
  onLoad: (game: ParsedGame) => void;
  onCancel?: () => void;
};

export function ImportPanel({ onLoad, onCancel }: Props) {
  const [pgn, setPgn] = useState('');
  const [error, setError] = useState<string | null>(null);

  function analyze(text: string) {
    try {
      onLoad(parseGame(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        <button className="primary" disabled={!pgn.trim()} onClick={() => analyze(pgn)}>
          Analyze
        </button>
        <label className="button">
          Upload .pgn
          <input type="file" accept=".pgn,text/plain" onChange={onFile} hidden />
        </label>
        <button className="link" onClick={() => analyze(OPERA_GAME_PGN)}>
          Try a sample game
        </button>
        {onCancel && (
          <button className="link" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
