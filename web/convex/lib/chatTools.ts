import { createTool } from '@convex-dev/agent';
import { PROMPT_LINE_PLIES, formatSanLine, formatScore, playSanLine, terminalScore, winPercent } from '@variant/chess-core';
import { z } from 'zod';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
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
    let analysis;
    try {
      analysis = await analyzeCached(ctx, fen);
    } catch (err) {
      console.error('evaluate: engine unavailable', err);
      return { error: 'The engine is unavailable right now, so this position could not be evaluated.' };
    }

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

type AddedBranch = { error: string } | { added: string; nodeId: Id<'nodes'>; finalFen: string };

/** Adds a line to the tree from the chat's position, so the player can step through it on the board. */
function addBranch(from: { nodeId: Id<'nodes'>; fen: string }) {
  return createTool({
    description:
      'Add a line of moves (SAN, starting from the current position) to the game tree as a what-if branch, ' +
      'so the player can see it on the board and ask about the position at its end. Use it when the player asks ' +
      'to see, show or play a line.',
    inputSchema: z.object({
      moves: z.array(z.string()).min(1).max(20).describe('Moves in SAN from the current position, e.g. ["Be3", "Bxe3", "fxe3"]'),
    }),
    execute: async (ctx, { moves }): Promise<AddedBranch> => {
      const line = playSanLine(from.fen, moves);
      if (line.illegal) {
        return { error: `${line.illegal.move} (move ${line.illegal.index + 1}) is ${line.illegal.reason}` };
      }
      const nodeId = await ctx.runMutation(internal.branches.addMovesInternal, {
        parentId: from.nodeId,
        moves: line.moves.map((m) => m.uci),
      });
      return {
        added: formatSanLine(from.fen, line.moves.map((m) => m.san)),
        nodeId,
        finalFen: line.moves.at(-1)!.fen,
      };
    },
  });
}

/** The tools for a reply at one position. */
export function chatTools(from: { nodeId: Id<'nodes'>; fen: string }) {
  return { evaluate, play_moves: playMoves, add_branch: addBranch(from) };
}
