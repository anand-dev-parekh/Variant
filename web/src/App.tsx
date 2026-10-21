import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { fenAtPly, type ParsedGame, type Score } from '@variant/chess-core';
import { EngineLines } from './components/EngineLines';
import { EvalBar } from './components/EvalBar';
import { ImportPanel } from './components/ImportPanel';
import { MoveList } from './components/MoveList';
import { useAnalysis } from './engine/useAnalysis';

const LAST_MOVE_STYLE = { background: 'rgba(255, 210, 60, 0.42)' };

export function App() {
  const [game, setGame] = useState<ParsedGame | null>(null);
  const [importing, setImporting] = useState(true);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [engineOn, setEngineOn] = useState(true);

  const fen = game ? fenAtPly(game, ply) : null;
  const analysis = useAnalysis(importing ? null : fen, engineOn);
  const gameOver = useMemo(() => (fen ? describeGameOver(fen) : null), [fen]);
  const barScore = gameOver ? gameOver.score : engineOn ? (analysis?.lines[0]?.score ?? null) : null;

  const lastPly = game && ply > 0 ? game.plies[ply - 1] : undefined;
  const bestLine = analysis?.lines[0];

  const go = useCallback(
    (target: number) => {
      if (game) setPly(Math.max(0, Math.min(game.plies.length, target)));
    },
    [game],
  );

  useEffect(() => {
    if (!game || importing) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => go(ply - 1),
        ArrowRight: () => go(ply + 1),
        ArrowUp: () => go(0),
        ArrowDown: () => go(game!.plies.length),
        Home: () => go(0),
        End: () => go(game!.plies.length),
        f: () => setOrientation((o) => (o === 'white' ? 'black' : 'white')),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, importing, ply, go]);

  if (importing || !game || !fen) {
    return (
      <main className="app">
        <ImportPanel
          onLoad={(g) => {
            setGame(g);
            setPly(0);
            setImporting(false);
          }}
          onCancel={game ? () => setImporting(false) : undefined}
        />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="game-header">
        <div>
          <strong>{game.headers.white}</strong> <span className="muted">vs</span>{' '}
          <strong>{game.headers.black}</strong>
          <span className="result">{game.headers.result}</span>
          {game.headers.event && (
            <span className="muted">
              {' '}
              · {game.headers.event}
              {game.headers.date && ` · ${game.headers.date}`}
            </span>
          )}
        </div>
        <button className="link" onClick={() => setImporting(true)}>
          New game
        </button>
      </header>

      <div className="workspace">
        <div className="board-area">
          <EvalBar score={barScore} orientation={orientation} />
          <div className="board">
            <Chessboard
              options={{
                id: 'main',
                position: fen,
                boardOrientation: orientation,
                allowDragging: false,
                animationDurationInMs: 150,
                squareStyles: lastPly
                  ? { [lastPly.uci.slice(0, 2)]: LAST_MOVE_STYLE, [lastPly.uci.slice(2, 4)]: LAST_MOVE_STYLE }
                  : {},
                arrows:
                  engineOn && bestLine?.pv[0]
                    ? [
                        {
                          startSquare: bestLine.pv[0].slice(0, 2),
                          endSquare: bestLine.pv[0].slice(2, 4),
                          color: 'rgba(40, 120, 220, 0.75)',
                        },
                      ]
                    : [],
              }}
            />
          </div>
        </div>

        <aside className="side">
          <EngineLines
            fen={fen}
            analysis={analysis}
            enabled={engineOn}
            gameOver={gameOver?.text ?? null}
            onToggle={() => setEngineOn((on) => !on)}
          />
          <MoveList plies={game.plies} current={ply} onSelect={go} />
          <nav className="controls" aria-label="Move navigation">
            <button onClick={() => go(0)} title="Start (↑)">⏮</button>
            <button onClick={() => go(ply - 1)} title="Back (←)">◀</button>
            <button onClick={() => go(ply + 1)} title="Forward (→)">▶</button>
            <button onClick={() => go(game.plies.length)} title="End (↓)">⏭</button>
            <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} title="Flip board (f)">
              ⇅
            </button>
          </nav>
        </aside>
      </div>
    </main>
  );
}

function describeGameOver(fen: string): { text: string; score: Score } | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    const whiteWon = chess.turn() === 'b';
    return { text: `Checkmate — ${whiteWon ? 'White' : 'Black'} wins.`, score: { mate: whiteWon ? 1 : -1 } };
  }
  if (chess.isStalemate()) return { text: 'Stalemate.', score: { cp: 0 } };
  if (chess.isInsufficientMaterial()) return { text: 'Draw by insufficient material.', score: { cp: 0 } };
  return null;
}
