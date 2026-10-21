import { Chess } from 'chess.js';

export type Color = 'w' | 'b';

/** One half-move of a game, plus the position it produced. */
export type Ply = {
  /** 1-based index into the game: ply 1 is White's first move. */
  ply: number;
  san: string;
  uci: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
};

export type GameHeaders = {
  white: string;
  black: string;
  result: string;
  event?: string;
  date?: string;
};

export type ParsedGame = {
  headers: GameHeaders;
  startFen: string;
  plies: Ply[];
};

export class PgnParseError extends Error {}

export function parseGame(pgn: string): ParsedGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn.trim());
  } catch (err) {
    throw new PgnParseError(err instanceof Error ? err.message : String(err));
  }

  const history = chess.history({ verbose: true });
  if (history.length === 0) {
    throw new PgnParseError('The PGN has no moves.');
  }

  const raw = chess.getHeaders();
  const headers: GameHeaders = {
    white: raw.White || 'White',
    black: raw.Black || 'Black',
    result: raw.Result || '*',
    event: raw.Event || undefined,
    date: raw.Date || undefined,
  };

  return {
    headers,
    startFen: history[0]!.before,
    plies: history.map((m, i) => ({
      ply: i + 1,
      san: m.san,
      uci: m.lan,
      color: m.color,
      fenBefore: m.before,
      fenAfter: m.after,
    })),
  };
}

/** FEN of the position after `ply` half-moves (0 = starting position). */
export function fenAtPly(game: ParsedGame, ply: number): string {
  return ply === 0 ? game.startFen : game.plies[ply - 1]!.fenAfter;
}

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** Move-number prefix for display, e.g. "12." for White or "12…" for Black. */
export function moveNumberLabel(fen: string, color: Color): string {
  const fullmove = fen.split(' ')[5] ?? '1';
  return color === 'w' ? `${fullmove}.` : `${fullmove}…`;
}

/** Formats SAN moves played from `fen` with move numbers: "12… Nc6 13. d4 exd4". */
export function formatSanLine(fen: string, san: string[]): string {
  let color = sideToMove(fen);
  let fullmove = Number(fen.split(' ')[5] ?? '1');
  const parts: string[] = [];
  san.forEach((move, i) => {
    if (color === 'w') parts.push(`${fullmove}.`);
    else if (i === 0) parts.push(`${fullmove}…`);
    parts.push(move);
    if (color === 'b') fullmove++;
    color = color === 'w' ? 'b' : 'w';
  });
  return parts.join(' ');
}
