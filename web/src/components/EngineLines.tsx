import { formatSanLine, formatScore, type Score } from '@variant/chess-core';

export type DisplayLine = { score: Score; san: string[] };

type Props = {
  fen: string;
  lines: DisplayLine[] | null;
  /** e.g. "Saved · depth 18" or "Live · depth 14…" */
  status: string;
  gameOver: string | null;
  liveEnabled: boolean;
  onToggleLive: () => void;
};

const MAX_PV_MOVES = 10;

export function EngineLines({ fen, lines, status, gameOver, liveEnabled, onToggleLive }: Props) {
  return (
    <section className="engine">
      <header className="engine-header">
        <span className="engine-title">Stockfish 19</span>
        <span className="muted">{status}</span>
        <label className="toggle muted" title="Run Stockfish in your browser for positions without saved analysis">
          <input type="checkbox" checked={liveEnabled} onChange={onToggleLive} />
          live
        </label>
      </header>
      {gameOver ? (
        <p className="muted engine-empty">{gameOver}</p>
      ) : !lines ? (
        <p className="muted engine-empty">{liveEnabled ? 'Thinking…' : 'No saved analysis for this position.'}</p>
      ) : (
        <ol className="engine-lines">
          {lines.map((line, i) => (
            <li key={i}>
              <span className={`score ${scoreClass(line.score)}`}>{formatScore(line.score)}</span>
              <span className="pv">{formatSanLine(fen, line.san.slice(0, MAX_PV_MOVES))}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function scoreClass(score: Score) {
  const v = score.mate ?? score.cp ?? 0;
  return v > 0 ? 'white-better' : v < 0 ? 'black-better' : '';
}
