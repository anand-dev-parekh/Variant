import { createTool } from '@convex-dev/agent';
import { PROMPT_LINE_PLIES, formatSanLine, formatScore, playSanLine, terminalScore, winPercent } from '@variant/chess-core';
import { z } from 'zod';
import { analyzeCached } from './cachedEngine';

/**
 * The chat's tools (design doc, M4: `evaluate` and `play_moves`). Every fact the LLM may state
 * about a position it didn't get from the fact sheet comes from one of these.
 */

export const playMoves = createTool({
  description:
    'Play SAN moves from a FEN and get the resulting positions. Use this to check that a move or line is legal ' +
    'before discussing it. Stops at the first illegal move and says why.',
  inputSchema: z.object({
    fen: z.string().describe('Position to play from'),
    moves: z.array(z.string()).min(1).max(20).describe('Moves in SAN, e.g. ["Nf3", "Nc6", "Bb5"]'),
  }),
  execute: async (_ctx, { fen, moves }) => {
    let line;
    try {
      line = playSanLine(fen, moves);
    } catch {
      return { error: `Not a valid FEN: ${fen}` };
    }
    return {
      line: line.moves.length ? formatSanLine(fen, line.moves.map((m) => m.san)) : '',
      positions: line.moves.map((m) => ({ san: m.san, fen: m.fen })),
      finalFen: line.moves.at(-1)?.fen ?? fen,
      ...(line.illegal && {
        illegal: `${line.illegal.move} (move ${line.illegal.index + 1}) is ${line.illegal.reason}`,
      }),
    };
  },
});

type Evaluation =
  | { error: string }
  | { gameOver: string; score: string; whiteWinPercent: number }
  | { score: string; whiteWinPercent: number; depth: number; lines: { line: string; score: string }[] };

export const evaluate = createTool({
  description:
    "Stockfish's evaluation of a position: score (White's point of view), White's win %, and the top lines in SAN. " +
    'Use it for any position not already covered by the fact sheet, e.g. after a move checked with play_moves.',
  inputSchema: z.object({ fen: z.string().describe('Position to evaluate') }),
  // Annotated: this module and the generated `internal` API reference each other.
  execute: async (ctx, { fen }): Promise<Evaluation> => {
    try {
      playSanLine(fen, []);
    } catch {
      return { error: `Not a valid FEN: ${fen}` };
    }
    const analysis = await analyzeCached(ctx, fen);

    if (analysis.terminal) {
      const score = terminalScore(fen, analysis.terminal);
      return { gameOver: analysis.terminal, score: formatScore(score), whiteWinPercent: Math.round(winPercent(score)) };
    }
    const best = analysis.lines[0]!;
    return {
      score: formatScore(best.score),
      whiteWinPercent: Math.round(winPercent(best.score)),
      depth: analysis.depth,
      lines: analysis.lines.map((l) => ({ line: formatSanLine(fen, l.san.slice(0, PROMPT_LINE_PLIES)), score: formatScore(l.score) })),
    };
  },
});

export const chatTools = { evaluate, play_moves: playMoves };
