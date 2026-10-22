import { useEffect, useRef, useState } from 'react';
import { OPERA_GAME_PGN, parseGame } from '@variant/chess-core';
import { MiniBoard } from './MiniBoard';

/**
 * A still picture of the explorer for the landing page: the Opera Game as a metro-line tree, drawn
 * with the same classes as the real tree (GameTreeView). Positions are real; the verdicts are
 * illustrative and hand-placed.
 */
const PLIES = parseGame(OPERA_GAME_PGN).plies;
const fenAfter = (ply: number) => PLIES[ply - 1]!.fenAfter;

type Stop =
  | { kind: 'move'; col: number; row: number; num: string; san: string; selected?: boolean; tone?: string }
  | { kind: 'run'; col: number; row: number; text: string; source?: 'engine' }
  | { kind: 'card'; col: number; row: number; num: string; san: string; ply: number; verdict: 'mistake' | 'blunder'; loss: number; best: string };

const STOPS: Stop[] = [
  { kind: 'move', col: 0, row: 0, num: '', san: 'Start' },
  { kind: 'run', col: 0, row: 1, text: '1. e4 … 6. Bc4 · 11 moves' },
  { kind: 'card', col: 0, row: 2, num: '6…', san: 'Nf6', ply: 12, verdict: 'mistake', loss: 22, best: '6… Qf6' },
  { kind: 'run', col: 1, row: 2, text: '6… Qf6 … +5', source: 'engine' },
  { kind: 'run', col: 0, row: 3, text: '7. Qb3 … 9. Bg5 · 5 moves' },
  { kind: 'card', col: 0, row: 4, num: '9…', san: 'b5', ply: 18, verdict: 'blunder', loss: 41, best: '9… Qc7' },
  { kind: 'run', col: 1, row: 4, text: '9… Qc7 … +5', source: 'engine' },
  { kind: 'run', col: 0, row: 5, text: '10. Nxb5 … 16… Nxb8 · 14 moves' },
  { kind: 'move', col: 0, row: 6, num: '17.', san: 'Rd8#', selected: true },
];

// Same geometry as the app's tree (lib/treeLayout GEOMETRY, GameTreeView DOT).
const COL = 280;
const ROW = 36;
const CARD = 104;
const GAP = 10;
const DOT = { x: 10, y: 18 };
const WIDTH = 440;

const rowHeights = STOPS.reduce<number[]>((h, s) => {
  h[s.row] = Math.max(h[s.row] ?? 0, s.kind === 'card' ? CARD : ROW);
  return h;
}, []);
const rowTops = rowHeights.map((_, i) => rowHeights.slice(0, i).reduce((sum, h) => sum + h + GAP, 0));
const HEIGHT = rowTops.at(-1)! + rowHeights.at(-1)!;
const at = (s: Stop) => ({ x: s.col * COL, y: rowTops[s.row]! });

/** Edges: down the main line, and from the position before each card out to its engine line. */
function edges() {
  const main = STOPS.filter((s) => s.col === 0);
  const out: { d: string; kind: string }[] = [];
  main.slice(1).forEach((s, i) => {
    const a = at(main[i]!);
    const b = at(s);
    const kind = s.kind === 'run' || main[i]!.kind === 'run' ? 'run' : '';
    out.push({ d: `M${a.x + DOT.x} ${a.y + DOT.y}V${b.y + DOT.y}`, kind });
  });
  for (const s of STOPS.filter((s) => s.col === 1)) {
    const from = at(main[main.findIndex((m) => m.row === s.row) - 1]!);
    const to = at(s);
    const sx = from.x + DOT.x;
    const tx = to.x + DOT.x;
    const ty = to.y + DOT.y;
    const turn = ty - DOT.y - GAP / 2;
    out.push({ d: `M${sx} ${from.y + DOT.y}V${turn - 8}Q${sx} ${turn} ${sx + 8} ${turn}H${tx - 8}Q${tx} ${turn} ${tx} ${turn + 8}V${ty}`, kind: 'engine' });
  }
  return out;
}
const EDGES = edges();

export function TreePreview() {
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Shrink the drawing to fit narrow screens instead of cropping it.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry!.contentRect.width / WIDTH)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="preview" aria-label="Preview: a game shown as a tree of moves">
      <div className="preview-bar">
        <span className="preview-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span>Morphy vs Duke Karl / Count Isouard</span>
        <span className="preview-result">1-0</span>
      </div>
      <div className="preview-canvas" ref={canvas} style={{ height: HEIGHT * scale + 32 }}>
        <div className="preview-stage" style={{ width: WIDTH, height: HEIGHT, transform: `scale(${scale})` }}>
          <svg className="preview-edges" width={WIDTH} height={HEIGHT} aria-hidden>
            {EDGES.map((e, i) => (
              <path key={i} d={e.d} className={e.kind} />
            ))}
          </svg>
          {STOPS.map((s, i) => (
            <div key={i} className="preview-stop" style={{ left: at(s).x, top: at(s).y }}>
              <StopView stop={s} />
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

function StopView({ stop: s }: { stop: Stop }) {
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
          {s.num && <span className="metro-num">{s.num} </span>}
          <span className="metro-san">{s.san}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="metro-item card">
      <span className={`metro-dot ${s.verdict}`} />
      <div className={`metro-card ${s.verdict}`}>
        <MiniBoard fen={fenAfter(s.ply)} size={84} />
        <div className="metro-card-text">
          <span className="metro-label">
            <span className="metro-num">{s.num} </span>
            <span className="metro-san">{s.san}</span>
            <span className={`metro-glyph ${s.verdict}`}>{s.verdict === 'blunder' ? '??' : '?'}</span>
          </span>
          <span className={`metro-verdict ${s.verdict}`}>
            {s.verdict === 'blunder' ? 'Blunder' : 'Mistake'} · −{s.loss}%
          </span>
          <span className="metro-meta">best {s.best}</span>
        </div>
      </div>
    </div>
  );
}
