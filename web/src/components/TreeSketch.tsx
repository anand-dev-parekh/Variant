import { useEffect, useRef, useState } from 'react';
import { OPERA_GAME_PGN, parseGame } from '@variant/chess-core';
import type { SketchStop } from '../lib/gameSummary';
import { MiniBoard } from './MiniBoard';

// Same geometry as the app's tree (lib/treeLayout GEOMETRY, GameTreeView DOT).
const COL = 280;
const ROW = 36;
const CARD = 104;
const GAP = 10;
const DOT = { x: 10, y: 18 };
const WIDTH = 460;

/**
 * A still picture of a game tree, drawn with the same classes as the real tree (GameTreeView):
 * the main line down the left, cards at turning points, engine lines to the right. It shrinks to
 * fit narrow screens instead of cropping.
 */
export function TreeSketch({ stops, flipped }: { stops: SketchStop[]; flipped?: boolean }) {
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry!.contentRect.width / WIDTH)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { at, height, edges } = layout(stops);
  return (
    <div className="tree-sketch" ref={canvas} style={{ height: height * scale }}>
      <div className="tree-sketch-stage" style={{ width: WIDTH, height, transform: `scale(${scale})` }}>
        <svg className="tree-sketch-edges" width={WIDTH} height={height} aria-hidden>
          {edges.map((e, i) => (
            <path key={i} d={e.d} className={e.kind} />
          ))}
        </svg>
        {stops.map((s, i) => (
          <div key={i} className="tree-sketch-stop" style={{ left: at(s).x, top: at(s).y }}>
            <StopView stop={s} flipped={flipped} />
          </div>
        ))}
      </div>
    </div>
  );
}

function layout(stops: SketchStop[]) {
  const heights = stops.reduce<number[]>((h, s) => {
    h[s.row] = Math.max(h[s.row] ?? 0, s.kind === 'card' ? CARD : ROW);
    return h;
  }, []);
  const tops = heights.map((_, i) => heights.slice(0, i).reduce((sum, h) => sum + h + GAP, 0));
  const height = (tops.at(-1) ?? 0) + (heights.at(-1) ?? 0);
  const at = (s: SketchStop) => ({ x: s.col * COL, y: tops[s.row]! });

  // Down the main line, and from the position before each turning point out to its engine line.
  const main = stops.filter((s) => s.col === 0);
  const edges: { d: string; kind: string }[] = [];
  main.slice(1).forEach((s, i) => {
    const a = at(main[i]!);
    const b = at(s);
    const kind = s.kind === 'run' || main[i]!.kind === 'run' ? 'run' : '';
    edges.push({ d: `M${a.x + DOT.x} ${a.y + DOT.y}V${b.y + DOT.y}`, kind });
  });
  for (const s of stops.filter((s) => s.col === 1)) {
    const from = at(main[main.findIndex((m) => m.row === s.row) - 1]!);
    const to = at(s);
    const sx = from.x + DOT.x;
    const tx = to.x + DOT.x;
    const ty = to.y + DOT.y;
    const turn = ty - DOT.y - GAP / 2;
    edges.push({ d: `M${sx} ${from.y + DOT.y}V${turn - 8}Q${sx} ${turn} ${sx + 8} ${turn}H${tx - 8}Q${tx} ${turn} ${tx} ${turn + 8}V${ty}`, kind: 'engine' });
  }
  return { at, height, edges };
}

const GLYPH = { blunder: '??', mistake: '?', key: '' };
const VERDICT = { blunder: 'Blunder', mistake: 'Mistake', key: 'Key moment' };

function StopView({ stop: s, flipped }: { stop: SketchStop; flipped?: boolean }) {
  if (s.kind === 'run') {
    return (
      <div className={`metro-item run ${s.source === 'engine' ? 'source-engine' : ''}`}>
        <span className="metro-dot run" />
        <span className="metro-label">
          <span className="metro-num">{s.text}</span>
        </span>
      </div>
    );
  }
  if (s.kind === 'move') {
    return (
      <div className={`metro-item ${s.selected ? 'selected' : ''}`}>
        <span className={`metro-dot ${s.selected ? 'selected' : ''}`} />
        <span className="metro-label">
          <span className="metro-san">{s.label}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="metro-item card">
      <span className={`metro-dot ${s.verdict}`} />
      <div className={`metro-card ${s.verdict}`}>
        <MiniBoard fen={s.fen} size={84} flipped={flipped} />
        <div className="metro-card-text">
          <span className="metro-label">
            <span className="metro-san">{s.label}</span>
            <span className={`metro-glyph ${s.verdict}`}>{GLYPH[s.verdict]}</span>
          </span>
          <span className={`metro-verdict ${s.verdict}`}>
            {VERDICT[s.verdict]} · −{s.loss}%
          </span>
          {s.best && <span className="metro-meta">best {s.best}</span>}
        </div>
      </div>
    </div>
  );
}

/** The Opera Game for the landing page. Positions are real; the verdicts are illustrative and hand-placed. */
const OPERA_PLIES = parseGame(OPERA_GAME_PGN).plies;
export const OPERA_STOPS: SketchStop[] = [
  { kind: 'move', col: 0, row: 0, label: 'Start' },
  { kind: 'run', col: 0, row: 1, text: '1. e4 … 6. Bc4 · 11 moves' },
  { kind: 'card', col: 0, row: 2, label: '6… Nf6', fen: OPERA_PLIES[11]!.fenAfter, verdict: 'mistake', loss: 22, best: '6… Qf6' },
  { kind: 'run', col: 1, row: 2, text: '6… Qf6 … +5', source: 'engine' },
  { kind: 'run', col: 0, row: 3, text: '7. Qb3 … 9. Bg5 · 5 moves' },
  { kind: 'card', col: 0, row: 4, label: '9… b5', fen: OPERA_PLIES[17]!.fenAfter, verdict: 'blunder', loss: 41, best: '9… Qc7' },
  { kind: 'run', col: 1, row: 4, text: '9… Qc7 … +5', source: 'engine' },
  { kind: 'run', col: 0, row: 5, text: '10. Nxb5 … 16… Nxb8 · 14 moves' },
  { kind: 'move', col: 0, row: 6, label: '17. Rd8#', selected: true },
];
