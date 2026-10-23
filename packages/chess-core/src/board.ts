import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { Color } from './game';

/** Plain facts about a position read off the board: no search, no judgement. */
export type BoardFacts = {
  /** Squares of each piece, king first, then queen, rooks, bishops, knights, pawns. */
  pieces: Record<Color, { type: PieceSymbol; square: Square }[]>;
  /** Material in pawn units (P1 N3 B3 R5 Q9), and White minus Black. */
  material: Record<Color, number>;
  materialBalance: number;
  inCheck: boolean;
  pawns: Record<Color, PawnFacts>;
};

export type PawnFacts = {
  /** Files holding two or more of this side's pawns, e.g. ["c"]. */
  doubled: string[];
  isolated: Square[];
  passed: Square[];
  /** Groups of pawns on adjacent files. */
  islands: number;
};

const VALUE: Record<PieceSymbol, number> = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };
const ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const FILES = 'abcdefgh';

export function boardFacts(fen: string): BoardFacts {
  const chess = new Chess(fen);
  const pieces: BoardFacts['pieces'] = { w: [], b: [] };
  for (const row of chess.board()) {
    for (const cell of row) if (cell) pieces[cell.color].push({ type: cell.type, square: cell.square });
  }
  for (const side of ['w', 'b'] as const) {
    pieces[side].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || a.square.localeCompare(b.square));
  }
  const material = {
    w: pieces.w.reduce((sum, p) => sum + VALUE[p.type], 0),
    b: pieces.b.reduce((sum, p) => sum + VALUE[p.type], 0),
  };
  const pawnSquares = (side: Color) => pieces[side].filter((p) => p.type === 'p').map((p) => p.square);
  return {
    pieces,
    material,
    materialBalance: material.w - material.b,
    inCheck: chess.inCheck(),
    pawns: { w: pawnFacts(pawnSquares('w'), pawnSquares('b'), 'w'), b: pawnFacts(pawnSquares('b'), pawnSquares('w'), 'b') },
  };
}

function pawnFacts(own: Square[], enemy: Square[], side: Color): PawnFacts {
  const file = (sq: Square) => FILES.indexOf(sq[0]!);
  const rank = (sq: Square) => Number(sq[1]);
  const perFile = new Map<number, number>();
  for (const sq of own) perFile.set(file(sq), (perFile.get(file(sq)) ?? 0) + 1);

  const doubled = [...perFile].filter(([, n]) => n > 1).map(([f]) => FILES[f]!).sort();
  const isolated = own.filter((sq) => !perFile.has(file(sq) - 1) && !perFile.has(file(sq) + 1));
  const passed = own.filter((sq) =>
    !enemy.some(
      (e) => Math.abs(file(e) - file(sq)) <= 1 && (side === 'w' ? rank(e) > rank(sq) : rank(e) < rank(sq)),
    ),
  );
  let islands = 0;
  for (let f = 0; f < 8; f++) if (perFile.has(f) && !perFile.has(f - 1)) islands++;
  return { doubled, isolated: isolated.sort(), passed: passed.sort(), islands };
}
