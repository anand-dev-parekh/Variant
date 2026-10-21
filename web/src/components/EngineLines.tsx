import { formatSanLine, formatScore } from '@variant/chess-core';
import type { Analysis } from '../engine/stockfish';

type Props = {
  fen: string;
  analysis: Analysis | null;
  enabled: boolean;
  gameOver: string | null;
  onToggle: () => void;
};

const MAX_PV_MOVES = 10;

export function EngineLines({ fen, analysis, enabled, gameOver, onToggle }: Props) {
  return (
    <section className="engine">
      <header className="engine-header">
        <label className="toggle">
          <input type="checkbox" checked={enabled} onChange={onToggle} />
          Stockfish 19
        </label>
        <span className="muted">
          {enabled && analysis && `depth ${analysis.depth}${analysis.done ? '' : '…'}`}
        </span>
      </header>
      {gameOver ? (
        <p className="muted engine-empty">{gameOver}</p>
      ) : !enabled ? null : !analysis ? (
        <p className="muted engine-empty">Thinking…</p>
      ) : (
        <ol className="engine-lines">
          {analysis.lines.map((line) => (
            <li key={line.multipv}>
              <span className={`score ${scoreClass(line.score)}`}>{formatScore(line.score)}</span>
              <span className="pv">{formatSanLine(fen, line.san.slice(0, MAX_PV_MOVES))}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function scoreClass(score: { cp?: number; mate?: number }) {
  const v = score.mate ?? score.cp ?? 0;
  return v > 0 ? 'white-better' : v < 0 ? 'black-better' : '';
}
