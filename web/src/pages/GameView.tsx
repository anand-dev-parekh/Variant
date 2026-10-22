import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { Chessboard } from 'react-chessboard';
import { terminalScore, terminalState, type Score } from '@variant/chess-core';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { EngineLines, type DisplayLine } from '../components/EngineLines';
import { EvalBar } from '../components/EvalBar';
import { GameTreeView } from '../components/GameTreeView';
import { TopBar } from '../components/TopBar';
import { GLYPHS, MoveList } from '../components/MoveList';
import { useAnalysis } from '../engine/useAnalysis';
import { GameTree, type TreeNode } from '../lib/tree';

const LAST_MOVE_STYLE = { background: 'rgba(255, 210, 60, 0.42)' };
const GAME_OVER_TEXT = {
  checkmate: (fen: string) => `Checkmate — ${fen.split(' ')[1] === 'w' ? 'Black' : 'White'} wins.`,
  stalemate: () => 'Stalemate.',
  insufficient: () => 'Draw by insufficient material.',
};

export function GameView({ gameId }: { gameId: Id<'games'> }) {
  const data = useQuery(api.games.tree, { gameId });
  const tree = useMemo(() => (data ? new GameTree(data.nodes) : null), [data?.nodes]);

  if (data === undefined) return <p className="muted center">Loading…</p>;
  if (data === null || !tree)
    return (
      <p className="center">
        Game not found. <a href="#/">Import a game</a>
      </p>
    );
  return <Explorer data={data} tree={tree} />;
}

type TreeData = NonNullable<ReturnType<typeof useQuery<typeof api.games.tree>>>;

function Explorer({ data, tree }: { data: TreeData; tree: GameTree }) {
  const { game, analyses, progress } = data;
  const [selectedId, setSelectedId] = useState<Id<'nodes'>>(tree.root._id);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [liveEnabled, setLiveEnabled] = useState(true);

  const node: TreeNode = tree.byId.get(selectedId) ?? tree.root;
  const saved = analyses[node.positionKey];
  const terminal = useMemo(() => terminalState(node.fen), [node.fen]);
  // The browser engine only runs where the server hasn't analyzed the position yet.
  const live = useAnalysis(node.fen, liveEnabled && !saved && !terminal);

  let lines: DisplayLine[] | null = null;
  let status = '';
  let best: { score: Score; pv: string[] } | undefined;
  if (saved && !terminal) {
    lines = saved.lines;
    best = saved.lines[0];
    status = `saved · depth ${saved.depth}`;
  } else if (live && !terminal) {
    lines = live.lines;
    best = live.lines[0];
    status = `live · depth ${live.depth}${live.done ? '' : '…'}`;
  }
  const barScore = terminal ? terminalScore(node.fen, terminal) : (best?.score ?? null);

  const go = useCallback((target: TreeNode | undefined) => target && setSelectedId(target._id), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => go(tree.parentOf(node)),
        ArrowRight: () => go(tree.next(node)),
        ArrowUp: () => go(tree.root),
        Home: () => go(tree.root),
        ArrowDown: () => go(tree.lineFrom(node).at(-1)),
        End: () => go(tree.lineFrom(node).at(-1)),
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
  }, [tree, node, go]);

  return (
    <>
      <TopBar>
        <a className="button ghost" href="#/">
          New game
        </a>
      </TopBar>
      <main className="app">
        <header className="game-header">
          <h1 className="game-title">
            {game.white} <span className="muted-serif">vs</span> {game.black}
          </h1>
          <span className="game-card-meta">
            <span className="result">{game.result}</span>
            {[game.event, game.date?.replaceAll('.', '-')].filter(Boolean).join(' · ')}
          </span>
        </header>

        {game.status === 'analyzing' && (
          <div className="progress" role="progressbar" aria-valuenow={progress.done} aria-valuemax={progress.total}>
            <div
              className="progress-fill"
              style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }}
            />
            <span>
              Analyzing positions at depth {game.depth}… {progress.done}/{progress.total}
            </span>
          </div>
        )}
        {game.status === 'failed' && <p className="error">Analysis failed: {game.error}</p>}
        {game.status === 'ready' && <Summary tree={tree} white={game.white} black={game.black} />}

        <div className="workspace">
          <div className="board-area">
            <EvalBar score={barScore} orientation={orientation} />
            <div className="board">
              <Chessboard
                options={{
                  id: 'main',
                  position: node.fen,
                  boardOrientation: orientation,
                  allowDragging: false,
                  animationDurationInMs: 150,
                  squareStyles: node.moveUci
                    ? { [node.moveUci.slice(0, 2)]: LAST_MOVE_STYLE, [node.moveUci.slice(2, 4)]: LAST_MOVE_STYLE }
                    : {},
                  arrows: best?.pv[0]
                    ? [
                        {
                          startSquare: best.pv[0].slice(0, 2),
                          endSquare: best.pv[0].slice(2, 4),
                          color: 'rgba(40, 120, 220, 0.75)',
                        },
                      ]
                    : [],
                }}
              />
            </div>
          </div>

          <GameTreeView tree={tree} selectedId={node._id} onSelect={setSelectedId} />

          <aside className="side">
            <EngineLines
              fen={node.fen}
              lines={lines}
              status={status}
              gameOver={terminal ? GAME_OVER_TEXT[terminal](node.fen) : null}
              liveEnabled={liveEnabled}
              onToggleLive={() => setLiveEnabled((on) => !on)}
            />
            {node.source !== 'game' && (
              <p className="branch-note">
                Engine line — not played in the game.{' '}
                <button className="link" onClick={() => go(nearestMainline(tree, node))}>
                  Back to game
                </button>
              </p>
            )}
            <MoveList tree={tree} selectedId={node._id} onSelect={setSelectedId} />
            <nav className="controls" aria-label="Move navigation">
              <button onClick={() => go(tree.root)} title="Start (↑)">
                ⏮
              </button>
              <button onClick={() => go(tree.parentOf(node))} title="Back (←)">
                ◀
              </button>
              <button onClick={() => go(tree.next(node))} title="Forward (→)">
                ▶
              </button>
              <button onClick={() => go(tree.lineFrom(node).at(-1))} title="End of line (↓)">
                ⏭
              </button>
              <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} title="Flip board (f)">
                ⇅
              </button>
            </nav>
          </aside>
        </div>
      </main>
    </>
  );
}

function nearestMainline(tree: GameTree, node: TreeNode): TreeNode {
  let n: TreeNode | undefined = node;
  while (n && n.source !== 'game') n = tree.parentOf(n);
  return n ?? tree.root;
}

/** Per-side counts of inaccuracies, mistakes and blunders. */
function Summary({ tree, white, black }: { tree: GameTree; white: string; black: string }) {
  const kinds = ['inaccuracy', 'mistake', 'blunder'] as const;
  const count = (side: 'w' | 'b', kind: string) =>
    tree.mainline.filter((n) => n.classification === kind && (n.fen.split(' ')[1] === 'b') === (side === 'w')).length;
  const critical = tree.mainline.filter((n) => n.critical).length;
  return (
    <div className="summary">
      {(['w', 'b'] as const).map((side) => (
        <span key={side}>
          <strong>{side === 'w' ? white : black}</strong>{' '}
          {kinds.map((k) => (
            <span key={k} className={`badge ${k}`} title={k}>
              {count(side, k)} {GLYPHS[k]}
            </span>
          ))}
        </span>
      ))}
      <span className="muted">
        <span className="critical-dot" /> {critical} critical moment{critical === 1 ? '' : 's'}
      </span>
    </div>
  );
}
