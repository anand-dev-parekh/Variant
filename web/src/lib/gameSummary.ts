import { formatScore, type Classification } from '@variant/chess-core';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../convex/_generated/api';

/** A game as `games.list` returns it, and its summary (set once analysis finishes). */
export type ListedGame = FunctionReturnType<typeof api.games.list>[number];
export type GameSummary = NonNullable<ListedGame['summary']>;
export type Moment = GameSummary['moments'][number];

/** "12." before White's 12th move, "12…" before Black's, from a 1-based ply of a game from the start. */
export function moveNumber(ply: number): string {
  const n = Math.ceil(ply / 2);
  return ply % 2 ? `${n}.` : `${n}…`;
}

export const plyLabel = (ply: number, san: string) => `${moveNumber(ply)} ${san}`;

/** Turning points are drawn like the tree's cards: blunders, mistakes, and the rest as key moments. */
export type MomentKind = 'blunder' | 'mistake' | 'key';
export const momentKind = (c: Classification): MomentKind => (c === 'blunder' || c === 'mistake' ? c : 'key');
export const KIND_LABEL: Record<MomentKind, string> = { blunder: 'Blunder', mistake: 'Mistake', key: 'Key moment' };

/** The biggest turning points (at most `max`), in game order. */
export function topMoments(summary: GameSummary, max = 4): Moment[] {
  return [...summary.moments]
    .sort((a, b) => b.winPercentLoss - a.winPercentLoss)
    .slice(0, max)
    .sort((a, b) => a.ply - b.ply);
}

/** The engine's move instead of a turning point, e.g. "19. Nxe5". */
export const bestLabel = (m: Moment) => m.best && plyLabel(m.ply, m.best.san[0]!);

export type Side = 'w' | 'b';
export type Outcome = 'won' | 'lost' | 'drawn';

/** The game's result for the player on `side`; null when the side or the result is unknown. */
export function outcomeFor(result: string, side: Side | null): Outcome | null {
  if (!side) return null;
  if (result === '1/2-1/2' || result === '½-½') return 'drawn';
  if (result === '1-0') return side === 'w' ? 'won' : 'lost';
  if (result === '0-1') return side === 'b' ? 'won' : 'lost';
  return null;
}

/** A stop in a sketch of the game tree (`TreeSketch`), on a grid of columns and rows. */
export type SketchStop =
  | { kind: 'move'; col: number; row: number; label: string; selected?: boolean }
  | { kind: 'run'; col: number; row: number; text: string; source?: 'engine' }
  | { kind: 'card'; col: number; row: number; label: string; fen: string; verdict: MomentKind; loss: number; best?: string };

/**
 * The game as the tree would show it, compressed: the main line down the left with its quiet
 * stretches folded into runs, a card at each of the biggest turning points, and the engine's line
 * there branching to the right.
 */
export function sketchOf(summary: GameSummary, max = 4): SketchStop[] {
  const n = summary.san.length;
  const label = (ply: number) => plyLabel(ply, summary.san[ply - 1]!);
  const run = (from: number, to: number) => (from === to ? label(from) : `${label(from)} … ${label(to)} · ${to - from + 1} moves`);

  const stops: SketchStop[] = [{ kind: 'move', col: 0, row: 0, label: 'Start' }];
  let row = 1;
  let prev = 0;
  for (const m of topMoments(summary, max)) {
    if (m.ply - 1 > prev) stops.push({ kind: 'run', col: 0, row: row++, text: run(prev + 1, m.ply - 1) });
    const best = bestLabel(m);
    stops.push({ kind: 'card', col: 0, row, label: label(m.ply), fen: m.fen, verdict: momentKind(m.classification), loss: Math.round(m.winPercentLoss), best });
    if (m.best) stops.push({ kind: 'run', col: 1, row, text: `${best} … ${formatScore(m.best.score)}`, source: 'engine' });
    row++;
    prev = m.ply;
  }
  if (n > prev) {
    if (n - 1 > prev) stops.push({ kind: 'run', col: 0, row: row++, text: run(prev + 1, n - 1) });
    stops.push({ kind: 'move', col: 0, row, label: label(n), selected: true });
  }
  return stops;
}
