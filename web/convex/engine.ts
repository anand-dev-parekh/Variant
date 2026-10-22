'use node';

import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { REMOTE_ENGINE_NAME, analyzeRemote, remoteEngineConfig } from './lib/remoteEngine';
import { ENGINE_NAME as WASM_ENGINE_NAME, analyzePosition, type ServerAnalysis } from './lib/stockfish';

/**
 * Each run analyzes positions for at most this long, then schedules a fresh run.
 * Keeps every action far below Convex's 10-minute limit and lets the progress bar move.
 */
const RUN_BUDGET_MS = 60_000;

/** Positions in flight at once on the engine service (it runs one engine per CPU). */
const REMOTE_CONCURRENCY = 4;

type Analyzer = {
  name: string;
  concurrency: number;
  analyze: (fen: string, opts: { depth: number; multiPv: number }) => Promise<ServerAnalysis>;
};

/** The native engine service when configured, else WASM Stockfish in this Node process. */
function analyzer(): Analyzer {
  const remote = remoteEngineConfig();
  if (remote) {
    return {
      name: REMOTE_ENGINE_NAME,
      concurrency: REMOTE_CONCURRENCY,
      analyze: (fen, opts) => analyzeRemote(remote, fen, opts),
    };
  }
  return { name: WASM_ENGINE_NAME, concurrency: 1, analyze: analyzePosition };
}

/** The engine pass over a game's main line. Reschedules itself until done, then finalizes. */
export const analyzeGame = internalAction({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const started = Date.now();
    const engine = analyzer();
    try {
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
          const analysis = await engine.analyze(job.fen, { depth: pending.depth, multiPv: pending.multiPv });
          await ctx.runMutation(internal.pipeline.saveAnalysis, {
            positionKey: job.positionKey,
            fen: job.fen,
            engine: engine.name,
            multiPv: pending.multiPv,
            ...analysis,
          });
        }
      };
      await Promise.all(Array.from({ length: engine.concurrency }, worker));

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

/** How fast is the configured engine? `npx convex run engine:benchmark '{"depth": 18}'` */
export const benchmark = internalAction({
  args: { depth: v.optional(v.number()) },
  handler: async (_ctx, { depth = 18 }) => {
    const engine = analyzer();
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'rn2kb1r/p3qppp/2p2n2/1p2p1B1/2B1P3/1QN5/PPP2PPP/R3K2R w KQkq - 0 10',
      'r1bqkb1r/pp3ppp/2n1pn2/2pp4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 6',
    ];
    const results = [];
    for (const fen of fens) {
      const t0 = Date.now();
      const analysis = await engine.analyze(fen, { depth, multiPv: 3 });
      results.push({ ms: Date.now() - t0, depth: analysis.depth, best: analysis.lines[0]?.san.slice(0, 3).join(' ') });
    }
    return { engine: engine.name, results };
  },
});
