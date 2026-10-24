import { Chess, type Square } from 'chess.js';
import type { Score } from './score';

/**
 * Cache key for a position: board, side to move, castling and en-passant fields of the FEN.
 * Move counters are dropped so the same position reached by different move orders shares one key.
 */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export type Terminal = 'checkmate' | 'stalemate' | 'insufficient';

/** Game-over state of a position, or null if play continues. */
export function terminalState(fen: string): Terminal | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  return null;
}

/**
 * The fixed evaluation of a finished position (White POV). A delivered mate is scored as
 * mate-in-1 for the winner: `mate: 0` can't carry a sign, and win % only needs the sign.
 */
export function terminalScore(fen: string, terminal: Terminal): Score {
  if (terminal !== 'checkmate') return { cp: 0 };
  // The side to move has been mated.
  return fen.split(' ')[1] === 'w' ? { mate: -1 } : { mate: 1 };
}

/** Plays UCI moves from `fen`; returns each resulting position, stopping at the first illegal move. */
export function playUciLine(fen: string, uciMoves: string[]): { uci: string; san: string; fen: string }[] {
  const chess = new Chess(fen);
  const out: { uci: string; san: string; fen: string }[] = [];
  for (const uci of uciMoves) {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      out.push({ uci, san: move.san, fen: move.after });
    } catch {
      break;
    }
  }
  return out;
}

export type PlayedLine = {
  moves: { san: string; uci: string; fen: string }[];
  /** The first move that couldn't be played, if any; later moves were not tried. */
  illegal?: { index: number; move: string; reason: string };
};

/** Plays SAN moves from `fen` (as written by a person or an LLM), stopping at the first illegal one. */
export function playSanLine(fen: string, sanMoves: string[]): PlayedLine {
  const chess = new Chess(fen);
  const moves: PlayedLine['moves'] = [];
  for (const [index, san] of sanMoves.entries()) {
    try {
      const move = chess.move(san.trim());
      moves.push({ san: move.san, uci: move.lan, fen: move.after });
    } catch {
      const reason = chess.isGameOver() ? 'the game is already over' : `not legal for ${chess.turn() === 'w' ? 'White' : 'Black'} here`;
      return { moves, illegal: { index, move: san, reason } };
    }
  }
  return { moves };
}

/**
 * The move a piece dragged (or clicked) from one square to another makes, or null if illegal.
 * Pawns reaching the last rank promote to a queen.
 */
/** Where the piece on `from` can move (promotions counted once), and whether each move captures. */
export function legalTargets(fen: string, from: string): { to: string; capture: boolean }[] {
  const targets = new Map<string, boolean>();
  try {
    for (const m of new Chess(fen).moves({ square: from as Square, verbose: true })) {
      targets.set(m.to, Boolean(m.captured));
    }
  } catch {
    return [];
  }
  return [...targets].map(([to, capture]) => ({ to, capture }));
}

export function moveFromSquares(fen: string, from: string, to: string): { uci: string; san: string; fen: string } | null {
  const piece = new Chess(fen).get(from as Square);
  if (!piece) return null;
  const promotes = piece.type === 'p' && (to[1] === '8' || to[1] === '1');
  return playUciLine(fen, [`${from}${to}${promotes ? 'q' : ''}`])[0] ?? null;
}
