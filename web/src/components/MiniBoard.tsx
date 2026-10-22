import { memo } from 'react';

const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

/** A static thumbnail of a position, drawn from the FEN's piece placement. White at the bottom unless flipped. */
export const MiniBoard = memo(function MiniBoard({
  fen,
  size = 84,
  flipped = false,
}: {
  fen: string;
  size?: number;
  flipped?: boolean;
}) {
  const ranks = fen.split(' ')[0]!.split('/');
  const squares: { file: number; rank: number; piece?: string }[] = [];
  ranks.forEach((row, rank) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) squares.push({ file: file++, rank });
      } else {
        squares.push({ file: file++, rank, piece: ch });
      }
    }
  });

  return (
    <svg className="mini-board" viewBox="0 0 8 8" width={size} height={size} aria-hidden>
      {squares.map(({ file, rank, piece }) => {
        const x = flipped ? 7 - file : file;
        const y = flipped ? 7 - rank : rank;
        const white = piece !== undefined && piece === piece.toUpperCase();
        return (
          <g key={`${file}${rank}`}>
            <rect x={x} y={y} width={1} height={1} className={(file + rank) % 2 ? 'sq-dark' : 'sq-light'} />
            {piece && (
              <text x={x + 0.5} y={y + 0.84} className={white ? 'pc-white' : 'pc-black'}>
                {GLYPH[piece.toLowerCase()]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});
