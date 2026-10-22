/**
 * A still picture of the explorer for the landing page: the Opera Game as a folded tree with one
 * engine branch. Illustrative, hand-placed; the real view is GameTreeView.
 */
const BOXES = [
  { x: 0, y: 0, label: 'Start' },
  { x: 0, y: 1, label: '1. e4 …', run: 5 },
  { x: 0, y: 2, label: '3… Bg4', kind: 'inaccuracy', glyph: '?!' },
  { x: 0, y: 3, label: '6… Nf6', kind: 'mistake', glyph: '?' },
  { x: 0, y: 4, label: '9… b5', kind: 'blunder', glyph: '??', critical: true },
  { x: 1, y: 4, label: '9… Qe6 …', run: 4, engine: true },
  { x: 2, y: 4, label: '9… Nbd7 …', run: 4, engine: true },
  { x: 0, y: 5, label: '10. Nxb5', kind: 'best' },
  { x: 0, y: 6, label: '10… cxb5 …', run: 13 },
  { x: 0, y: 7, label: '17. Rd8#', kind: 'best', selected: true },
] as const;

const W = 132;
const H = 30;
const COL = 152;
const ROW = 44;
const PAD = 20;

export function TreePreview() {
  const width = PAD * 2 + COL * 2 + W;
  const height = PAD * 2 + ROW * 7 + H;
  const cx = (col: number) => PAD + col * COL + W / 2;
  const top = (row: number) => PAD + row * ROW;

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
      <div className="preview-canvas">
        <svg viewBox={`0 0 ${width} ${height}`} role="presentation">
          <g className="preview-edges">
            <path d={`M${cx(0)} ${top(0) + H} V${top(7)}`} />
            {[1, 2].map((col) => (
              <path
                key={col}
                className="engine"
                d={`M${cx(0)} ${top(3) + H} V${top(3) + H + 7} H${cx(col)} V${top(4)}`}
              />
            ))}
          </g>
          {BOXES.map((b) => (
            <foreignObject key={b.label} x={PAD + b.x * COL} y={top(b.y)} width={W} height={H}>
              <div
                className={[
                  'tree-box',
                  'run' in b ? 'run' : '',
                  'engine' in b ? 'source-engine' : '',
                  'kind' in b ? b.kind : '',
                  'selected' in b ? 'selected' : '',
                ].join(' ')}
              >
                <span className="tree-label">
                  {b.label}
                  {'glyph' in b && b.glyph}
                </span>
                {'critical' in b && <span className="critical-dot" />}
                {'run' in b && <span className="run-count">+{b.run}</span>}
              </div>
            </foreignObject>
          ))}
        </svg>
      </div>
    </figure>
  );
}
