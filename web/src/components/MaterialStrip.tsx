import { captures, type Color } from '@variant/chess-core';
import { defaultPieces } from 'react-chessboard';

const PIECE_STYLE = { width: 22, height: 22 };

/**
 * One player's row beside the board: their name, the pieces they've captured (the latest capture
 * highlighted), and their material lead.
 */
export function MaterialStrip({ fen, prevFen, side, name }: { fen: string; prevFen?: string; side: Color; name: string }) {
  const now = captures(fen);
  const taken = now.by[side];
  // Pieces taken by the move into this position: compare with the position before it.
  const fresh = new Map<string, number>();
  if (prevFen) {
    const before = captures(prevFen).by[side];
    for (const t of taken) fresh.set(t, (fresh.get(t) ?? 0) + 1);
    for (const t of before) fresh.set(t, (fresh.get(t) ?? 0) - 1);
  }
  const lead = side === 'w' ? now.lead : -now.lead;
  // Captured pieces are the opponent's: White's row shows black pieces.
  const prefix = side === 'w' ? 'b' : 'w';

  return (
    <div className="material-strip">
      <span className={`material-name side-${side}`}>{name}</span>
      <span className="material-pieces" aria-label={taken.length ? `Captured: ${taken.join(' ')}` : undefined}>
        {taken.map((t, i) => {
          const isFresh = (fresh.get(t) ?? 0) > 0 && taken.indexOf(t, i + 1) === -1;
          return (
            <span
              key={i}
              className={`material-piece${taken[i - 1] === t ? ' stacked' : ''}${isFresh ? ' fresh' : ''}`}
            >
              {defaultPieces[`${prefix}${t.toUpperCase()}`]!({ svgStyle: PIECE_STYLE })}
            </span>
          );
        })}
      </span>
      {lead > 0 && <span className="material-lead">+{lead}</span>}
    </div>
  );
}
