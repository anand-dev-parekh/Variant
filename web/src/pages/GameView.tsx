import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { Chessboard } from 'react-chessboard';
import { formatSanLine, formatScore, terminalScore, terminalState, type Score } from '@variant/chess-core';
import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import { EngineLines, type DisplayLine } from '../components/EngineLines';
import { EvalBar } from '../components/EvalBar';
import { EvalGraph } from '../components/EvalGraph';
import { GameTreeView, type Revealed } from '../components/GameTreeView';
import { GLYPHS, MoveList } from '../components/MoveList';
import { TopBar } from '../components/TopBar';
import { useAnalysis } from '../engine/useAnalysis';
import { GameTree, type TreeNode } from '../lib/tree';
import { moveLabel } from '../lib/treeLayout';

const LAST_MOVE_STYLE = { background: 'rgba(255, 210, 60, 0.42)' };
const GAME_OVER_TEXT = {
  checkmate: (fen: string) => `Checkmate — ${fen.split(' ')[1] === 'w' ? 'Black' : 'White'} wins.`,
  stalemate: () => 'Stalemate.',
  insufficient: () => 'Draw by insufficient material.',
};

const TABS = ['position', 'tree', 'moves'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { position: 'Position', tree: 'Tree', moves: 'Moves' };
const TAB_KEY = 'variant:tab';

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
  const [tab, setTab] = useState<Tab>(readTab);
  const [fullscreen, setFullscreen] = useState(false);
  const [revealed, setRevealedState] = useState<Revealed>(() => new Set());
  const setRevealed = useCallback((update: (prev: Revealed) => Revealed) => setRevealedState(update), []);
  const [hoverId, setHoverId] = useState<Id<'nodes'> | null>(null);

  const node: TreeNode = tree.byId.get(selectedId) ?? tree.root;
  const saved = analyses[node.positionKey];
  const terminal = useMemo(() => terminalState(node.fen), [node.fen]);
  // The browser engine only runs where the server hasn't analyzed the position yet.
  const live = useAnalysis(node.fen, liveEnabled && !saved && !terminal);

  let lines: DisplayLine[] | null = null;
  let status = '';
  let best: { score: Score; pv: string[]; san: string[] } | undefined;
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
  const flip = () => setOrientation((o) => (o === 'white' ? 'black' : 'white'));

  const chooseTab = (next: Tab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Storage can be unavailable (private windows); the tab just isn't remembered.
    }
  };

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
        f: flip,
        t: () => setFullscreen((on) => !on),
        Escape: () => setFullscreen(false),
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

  const treeProps = {
    tree,
    analyses,
    selectedId: node._id,
    onSelect: setSelectedId,
    revealed,
    setRevealed,
    flipped: orientation === 'black',
  };

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
          {game.status === 'ready' && <Summary tree={tree} white={game.white} black={game.black} />}
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

        <div className="workspace">
          <div className="board-column">
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
            <EvalGraph tree={tree} analyses={analyses} selectedId={node._id} onSelect={setSelectedId} />
            <p className="best-strip" title="Engine's best line">
              {terminal ? (
                GAME_OVER_TEXT[terminal](node.fen)
              ) : best ? (
                <>
                  <span className="best-score">{formatScore(best.score)}</span>
                  <span className="best-line">{formatSanLine(node.fen, best.san.slice(0, 8))}</span>
                </>
              ) : (
                <span className="muted">{liveEnabled ? 'Thinking…' : 'No saved analysis'}</span>
              )}
            </p>
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
              <button onClick={flip} title="Flip board (f)">
                ⇅
              </button>
            </nav>
          </div>

          <section className="panel" aria-label="Game details">
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={`tab ${tab === t ? 'active' : ''}`}
                  onClick={() => chooseTab(t)}
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
              <button className="tab-action ghost" onClick={() => setFullscreen(true)} title="Full-screen tree (t)">
                ⤢ <span>Full screen</span>
              </button>
            </div>
            <div className={`tab-body tab-${tab}`}>
              {tab === 'position' && (
                <PositionCard
                  tree={tree}
                  node={node}
                  analyses={analyses}
                  go={go}
                  engine={
                    <EngineLines
                      fen={node.fen}
                      lines={lines}
                      status={status}
                      gameOver={terminal ? GAME_OVER_TEXT[terminal](node.fen) : null}
                      liveEnabled={liveEnabled}
                      onToggleLive={() => setLiveEnabled((on) => !on)}
                    />
                  }
                />
              )}
              {tab === 'tree' && !fullscreen && <GameTreeView {...treeProps} />}
              {tab === 'moves' && <MoveList tree={tree} selectedId={node._id} onSelect={setSelectedId} />}
            </div>
          </section>
        </div>
      </main>

      {fullscreen && (
        <div className="tree-overlay" role="dialog" aria-modal="true" aria-label="Game tree">
          <header className="overlay-bar">
            <strong>
              {game.white} <span className="muted">vs</span> {game.black}
            </strong>
            <span className="muted">← → to step · hover a move to preview · Esc to close</span>
            <button className="ghost" onClick={() => setFullscreen(false)}>
              ✕ Close
            </button>
          </header>
          <div className="overlay-canvas">
            <GameTreeView {...treeProps} onHover={setHoverId} />
          </div>
          <FloatingBoard
            node={tree.byId.get(hoverId ?? node._id) ?? node}
            preview={hoverId !== null && hoverId !== node._id}
            orientation={orientation}
            analyses={analyses}
          />
        </div>
      )}
    </>
  );
}

function readTab(): Tab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved && (TABS as readonly string[]).includes(saved)) return saved as Tab;
  } catch {
    // Storage unavailable: use the default.
  }
  return 'tree';
}

const VERDICT: Record<string, string> = {
  best: 'Best move',
  good: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

/** What happened at the selected position, in words, above the engine lines. Chat goes here in M4. */
function PositionCard({
  tree,
  node,
  analyses,
  go,
  engine,
}: {
  tree: GameTree;
  node: TreeNode;
  analyses: Record<string, Doc<'analyses'>>;
  go: (n: TreeNode | undefined) => void;
  engine: React.ReactNode;
}) {
  const parent = tree.parentOf(node);
  const bestSan = parent ? analyses[parent.positionKey]?.lines[0]?.san[0] : undefined;
  const bestLabel = parent && bestSan ? `${moveNumberBefore(parent)}${bestSan}` : undefined;
  const engineAlt = tree.alternativesTo(node).find((n) => n.source === 'engine');
  const glyph = node.classification ? GLYPHS[node.classification] : undefined;

  return (
    <div className="position-card">
      <div className="position-head">
        <h2>
          {node.moveSan ? moveLabel(node) : 'Starting position'}
          {glyph && <span className={`metro-glyph ${node.classification}`}>{glyph}</span>}
        </h2>
        {node.classification && (
          <span className={`verdict-pill ${node.keyMoment ? 'key' : node.classification}`}>
            {node.keyMoment ? 'Key moment' : VERDICT[node.classification]}
            {node.winPercentLoss !== undefined && node.winPercentLoss >= 1 && ` · −${node.winPercentLoss.toFixed(0)}%`}
          </span>
        )}
      </div>

      {node.keyMoment && (
        <p className="position-note">
          One of {node.fen.split(' ')[1] === 'b' ? 'White' : 'Black'}'s biggest slips in this game. Not a mistake on
          its own, but this is where ground was lost.
        </p>
      )}
      {(node.critical || node.keyMoment) && bestLabel && (
        <p className="position-note">
          The engine preferred <strong>{bestLabel}</strong>.{' '}
          {engineAlt && (
            <button className="link" onClick={() => go(engineAlt)}>
              Show that line
            </button>
          )}
        </p>
      )}
      {node.onlyMove && node.classification === 'best' && (
        <p className="position-note">Only move: every alternative lost ground.</p>
      )}
      {node.source !== 'game' && (
        <p className="position-note branch">
          {node.source === 'engine' ? 'Engine line, not played in the game.' : 'Your what-if.'}{' '}
          <button className="link" onClick={() => go(nearestMainline(tree, node))}>
            Back to game
          </button>
        </p>
      )}

      {engine}
      <p className="chat-placeholder muted">Questions about this position will go here.</p>
    </div>
  );
}

/** The selected (or hovered) position, floating over the full-screen tree. */
function FloatingBoard({
  node,
  preview,
  orientation,
  analyses,
}: {
  node: TreeNode;
  preview: boolean;
  orientation: 'white' | 'black';
  analyses: Record<string, Doc<'analyses'>>;
}) {
  const a = analyses[node.positionKey];
  const score = a ? (a.terminal ? terminalScore(a.fen, a.terminal) : a.lines[0]?.score) : undefined;
  return (
    <aside className={`floating-board ${preview ? 'preview' : ''}`}>
      <div className="floating-head">
        <span>{node.moveSan ? moveLabel(node) : 'Start'}</span>
        <span className="muted">{preview ? 'preview' : score ? formatScore(score) : ''}</span>
      </div>
      <Chessboard
        options={{
          id: 'floating',
          position: node.fen,
          boardOrientation: orientation,
          allowDragging: false,
          showNotation: false,
          animationDurationInMs: 0,
          squareStyles: node.moveUci
            ? { [node.moveUci.slice(0, 2)]: LAST_MOVE_STYLE, [node.moveUci.slice(2, 4)]: LAST_MOVE_STYLE }
            : {},
        }}
      />
    </aside>
  );
}

/** "15. " or "15… " for the move about to be played from `node`'s position. */
function moveNumberBefore(node: TreeNode): string {
  const [, turn, , , , fullmove] = node.fen.split(' ');
  return turn === 'w' ? `${fullmove}. ` : `${fullmove}… `;
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
    </div>
  );
}
