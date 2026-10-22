import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { ENGINE_NAME, analyzeRemote, remoteEngineConfig } from './lib/remoteEngine';

/**
 * Each run analyzes positions for at most this long, then schedules a fresh run.
 * Keeps every action far below Convex's 10-minute limit and lets the progress bar move.
 */
const RUN_BUDGET_MS = 60_000;

/** Positions in flight at once on the engine service (it queues what it can't run yet). */
const CONCURRENCY = 4;

/** The engine pass over a game's main line. Reschedules itself until done, then finalizes. */
export const analyzeGame = internalAction({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const started = Date.now();
    try {
      const config = remoteEngineConfig();
      const pending = await ctx.runQuery(internal.pipeline.pendingPositions, { gameId });
      if (!pending) return;

      const queue = [...pending.positions];
      let outOfTime = false;
      const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          if (Date.now() - started > RUN_BUDGET_MS) {
            outOfTime = true;
            return;
          }
          const analysis = await analyzeRemote(config, job.fen, { depth: pending.depth, multiPv: pending.multiPv });
          await ctx.runMutation(internal.pipeline.saveAnalysis, {
            positionKey: job.positionKey,
            fen: job.fen,
            engine: ENGINE_NAME,
            multiPv: pending.multiPv,
            ...analysis,
          });
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      if (outOfTime) {
        await ctx.scheduler.runAfter(0, internal.engine.analyzeGame, { gameId });
        return;
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

/** How fast is the engine service? `npx convex run engine:benchmark '{"depth": 18}'` */
export const benchmark = internalAction({
  args: { depth: v.optional(v.number()) },
  handler: async (_ctx, { depth = 18 }) => {
    const config = remoteEngineConfig();
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'rn2kb1r/p3qppp/2p2n2/1p2p1B1/2B1P3/1QN5/PPP2PPP/R3K2R w KQkq - 0 10',
      'r1bqkb1r/pp3ppp/2n1pn2/2pp4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 6',
    ];
    const results = [];
    for (const fen of fens) {
      const t0 = Date.now();
      const analysis = await analyzeRemote(config, fen, { depth, multiPv: 3 });
      results.push({ ms: Date.now() - t0, depth: analysis.depth, best: analysis.lines[0]?.san.slice(0, 3).join(' ') });
    }
    return { engine: ENGINE_NAME, results };
  },
});
