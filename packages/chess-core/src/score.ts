import type { Color } from './game';

/**
 * An engine score. `cp` is centipawns, `mate` is moves to mate (negative = getting mated).
 * Scores in this package are always from White's point of view unless a name says otherwise.
 */
export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };

/** UCI reports scores for the side to move; flip to White's point of view. */
export function toWhitePov(score: Score, sideToMove: Color): Score {
  if (sideToMove === 'w') return score;
  return score.mate !== undefined ? { mate: -score.mate } : { cp: -score.cp };
}

/**
 * Chance (0–100) that White wins, from a White-POV score.
 * Uses Lichess's fitted logistic curve so that the same centipawn loss
 * counts for less when the game is already decided.
 */
export function winPercent(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** "+1.25", "-0.40", "#3", "#-2" — White's point of view. */
export function formatScore(score: Score): string {
  if (score.mate !== undefined) return `#${score.mate}`;
  const pawns = score.cp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}
