'use node';

import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { ENGINE_NAME, analyzePosition } from './lib/stockfish';

/**
 * Each run analyzes positions for at most this long, then schedules a fresh run.
 * Keeps every action far below Convex's 10-minute limit and lets the progress bar move.
 */
const RUN_BUDGET_MS = 60_000;

/** The engine pass over a game's main line. Reschedules itself until done, then finalizes. */
export const analyzeGame = internalAction({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const started = Date.now();
    try {
      const pending = await ctx.runQuery(internal.pipeline.pendingPositions, { gameId });
      if (!pending) return;

      for (const { positionKey, fen } of pending.positions) {
        if (Date.now() - started > RUN_BUDGET_MS) {
          await ctx.scheduler.runAfter(0, internal.engine.analyzeGame, { gameId });
          return;
        }
        const analysis = await analyzePosition(fen, pending);
        await ctx.runMutation(internal.pipeline.saveAnalysis, {
          positionKey,
          fen,
          engine: ENGINE_NAME,
          multiPv: pending.multiPv,
          ...analysis,
        });
      }

      await ctx.runMutation(internal.pipeline.finalize, { gameId });
    } catch (err) {
      console.error('analyzeGame failed', err);
      await ctx.runMutation(internal.pipeline.markFailed, {
        gameId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

/** Spike: how fast is WASM Stockfish on Convex? `npx convex run engine:benchmark` */
export const benchmark = internalAction({
  args: { depth: v.optional(v.number()) },
  handler: async (_ctx, { depth = 18 }) => {
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'rn2kb1r/p3qppp/2p2n2/1p2p1B1/2B1P3/1QN5/PPP2PPP/R3K2R w KQkq - 0 10',
      'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 9',
    ];
    const results = [];
    for (const fen of fens) {
      const t0 = Date.now();
      const analysis = await analyzePosition(fen, { depth, multiPv: 3 });
      results.push({ ms: Date.now() - t0, depth: analysis.depth, best: analysis.lines[0]?.san.slice(0, 3).join(' ') });
    }
    return { results, rssMb: Math.round(process.memoryUsage().rss / 1e6) };
  },
});
