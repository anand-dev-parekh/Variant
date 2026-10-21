import type { Color } from './game';
import { winPercent, type Score } from './score';

export type Classification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * Win-% points lost by the mover (Lichess's cutoffs). Tunable: these decide what the
 * tree branches on, so expect to adjust them once we look at real games.
 */
export const THRESHOLDS = {
  inaccuracy: 10,
  mistake: 20,
  blunder: 30,
  /** A ply is critical when the played move loses at least this much… */
  critical: 20,
  /** …or when the best move is this much better than the second best ("only move"). */
  onlyMove: 20,
} as const;

/** Win % for `color` from a White-POV score. */
export function winPercentFor(score: Score, color: Color): number {
  const white = winPercent(score);
  return color === 'w' ? white : 100 - white;
}

export type MoveVerdict = {
  classification: Classification;
  /** Win-% points the mover gave up compared with the engine's best move (≥ 0). */
  winPercentLoss: number;
  /** The engine's best move was the only one that kept the evaluation. */
  onlyMove: boolean;
  critical: boolean;
};

/**
 * Judges one move.
 * @param before engine lines for the position the move was played from, best first (White POV)
 * @param after evaluation of the position after the move (White POV)
 */
export function judgeMove(args: {
  mover: Color;
  playedUci: string;
  before: { score: Score; pv: string[] }[];
  after: Score;
}): MoveVerdict {
  const [best, second] = args.before;
  if (!best) throw new Error('judgeMove: no engine lines for the position before the move');

  const bestWin = winPercentFor(best.score, args.mover);
  const playedWin = winPercentFor(args.after, args.mover);
  const winPercentLoss = Math.max(0, bestWin - playedWin);
  const onlyMove = second !== undefined && bestWin - winPercentFor(second.score, args.mover) >= THRESHOLDS.onlyMove;

  let classification: Classification;
  if (args.playedUci === best.pv[0]) classification = 'best';
  else if (winPercentLoss >= THRESHOLDS.blunder) classification = 'blunder';
  else if (winPercentLoss >= THRESHOLDS.mistake) classification = 'mistake';
  else if (winPercentLoss >= THRESHOLDS.inaccuracy) classification = 'inaccuracy';
  else classification = 'good';
  if (classification !== 'best') {
    classification = worst(classification, mateVerdict(best.score, args.after, args.mover));
  }

  return {
    classification,
    winPercentLoss,
    onlyMove,
    critical: winPercentLoss >= THRESHOLDS.critical || onlyMove || classification === 'blunder',
  };
}

const SEVERITY: Classification[] = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];

function worst(a: Classification, b: Classification | null): Classification {
  return b && SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a;
}

/** Mover-POV centipawns, or ±Infinity for mate. */
function moverCp(score: Score, mover: Color): number {
  const sign = mover === 'w' ? 1 : -1;
  if (score.mate !== undefined) return sign * score.mate > 0 ? Infinity : -Infinity;
  return sign * score.cp;
}

/**
 * Lichess's mate rules, which win % alone undersells: walking into a forced mate is a
 * blunder unless the position was already badly lost, and letting a forced mate slip is
 * a blunder unless the result is still crushing.
 */
function mateVerdict(best: Score, after: Score, mover: Color): Classification | null {
  const before = moverCp(best, mover);
  const now = moverCp(after, mover);
  if (now === -Infinity && before !== -Infinity) {
    return before < -999 ? 'inaccuracy' : before < -700 ? 'mistake' : 'blunder';
  }
  if (before === Infinity && now !== Infinity) {
    return now > 999 ? 'inaccuracy' : now > 700 ? 'mistake' : 'blunder';
  }
  return null;
}
