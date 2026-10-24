import { v } from 'convex/values';
import { judgeMove, pickKeyMoments, playUciLine, positionKey, terminalScore, type Score } from '@variant/chess-core';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { MAX_NODES } from './games';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import { vEngineLine } from './schema';

/** Engine alternatives shown at each critical moment (the move that should have been played), and how many plies each runs. */
const BRANCH_ALTERNATIVES = 1;
const BRANCH_PLIES = 5;

async function analysisFor(ctx: QueryCtx, key: string) {
  return ctx.db
    .query('analyses')
    .withIndex('by_positionKey', (q) => q.eq('positionKey', key))
    .first();
}

/** Main-line nodes in ply order. */
function mainlineOf(ctx: QueryCtx, gameId: Id<'games'>) {
  return ctx.db
    .query('nodes')
    .withIndex('by_gameId_and_source_and_ply', (q) => q.eq('gameId', gameId).eq('source', 'game'))
    .take(MAX_NODES);
}

/**
 * Main-line positions with no server analysis yet (deduplicated). Any saved analysis counts:
 * the engine can legitimately stop short of the target depth, e.g. in forced mates.
 */
export const pendingPositions = internalQuery({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get('games', gameId);
    if (!game) return null;
    const pending = new Map<string, string>();
    for (const node of await mainlineOf(ctx, gameId)) {
      if (pending.has(node.positionKey)) continue;
      if (!(await analysisFor(ctx, node.positionKey))) pending.set(node.positionKey, node.fen);
    }
    return {
      depth: game.depth,
      multiPv: game.multiPv,
      positions: [...pending].map(([key, fen]) => ({ positionKey: key, fen })),
    };
  },
});

export const saveAnalysis = internalMutation({
  args: {
    positionKey: v.string(),
    fen: v.string(),
    engine: v.string(),
    depth: v.number(),
    multiPv: v.number(),
    terminal: v.optional(v.union(v.literal('checkmate'), v.literal('stalemate'), v.literal('insufficient'))),
    lines: v.array(vEngineLine),
  },
  handler: async (ctx, analysis) => {
    const existing = await analysisFor(ctx, analysis.positionKey);
    if (!existing) await ctx.db.insert('analyses', analysis);
    else if (existing.depth < analysis.depth) await ctx.db.replace('analyses', existing._id, analysis);
  },
});

/** White-POV score of an analyzed position. */
function scoreOf(analysis: Doc<'analyses'>): Score {
  if (analysis.terminal) return terminalScore(analysis.fen, analysis.terminal);
  const best = analysis.lines[0];
  if (!best) throw new Error(`No engine lines for ${analysis.positionKey}`);
  return best.score;
}

/**
 * Runs once every main-line position is analyzed: classifies each played move, marks the
 * critical moments, and adds the engine's alternatives there as `engine` branches.
 */
export const finalize = internalMutation({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get('games', gameId);
    if (!game || game.status !== 'analyzing') return;
    await classifyAndBranch(ctx, gameId);
    await ctx.db.patch('games', gameId, { status: 'ready', summary: await summarize(ctx, gameId) });
  },
});

/**
 * Dev tool for tuning thresholds: redo classification and engine branches for an analyzed
 * game without re-running the engine. `npx convex run pipeline:reclassify '{"gameId": "…"}'`
 */
export const reclassify = internalMutation({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get('games', gameId);
    if (!game || game.status !== 'ready') throw new Error('Only finished games can be reclassified');
    const engineNodes = await ctx.db
      .query('nodes')
      .withIndex('by_gameId_and_source_and_ply', (q) => q.eq('gameId', gameId).eq('source', 'engine'))
      .take(MAX_NODES);
    for (const node of engineNodes) await ctx.db.delete('nodes', node._id);
    await classifyAndBranch(ctx, gameId);
    await ctx.db.patch('games', gameId, { summary: await summarize(ctx, gameId) });
  },
});

/** One-off: summaries for games analyzed before they existed. `npx convex run pipeline:summarizeAll` */
export const summarizeAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    let done = 0;
    for (const game of await ctx.db.query('games').take(200)) {
      if (game.status !== 'ready' || game.summary) continue;
      await ctx.db.patch('games', game._id, { summary: await summarize(ctx, game._id) });
      done++;
    }
    return done;
  },
});

/** Engine scores as pawns for a graph: mate counts as ±10. */
function pawns(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? 10 : -10;
  return Math.max(-10, Math.min(10, Math.round(score.cp) / 100));
}

/** The game's summary, from its classified main line and engine branches. */
async function summarize(ctx: QueryCtx, gameId: Id<'games'>): Promise<Doc<'games'>['summary']> {
  const nodes = await mainlineOf(ctx, gameId);
  const evals: number[] = [];
  for (const node of nodes) {
    const analysis = await analysisFor(ctx, node.positionKey);
    evals.push(analysis ? pawns(scoreOf(analysis)) : (evals.at(-1) ?? 0));
  }

  const moments = [];
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i]!;
    if (!node.classification || (!node.critical && !node.keyMoment)) continue;
    const parent = nodes[i - 1]!;
    const san: string[] = [];
    let firstUci: string | undefined;
    for (let at = parent._id; ; ) {
      const next = (await ctx.db.query('nodes').withIndex('by_parentId', (q) => q.eq('parentId', at)).take(20)).find(
        (n) => n.source === 'engine',
      );
      if (!next?.moveSan) break;
      firstUci ??= next.moveUci;
      san.push(next.moveSan);
      at = next._id;
    }
    const line = (await analysisFor(ctx, parent.positionKey))?.lines.find((l) => l.pv[0] === firstUci);
    moments.push({
      ply: node.ply,
      classification: node.classification,
      winPercentLoss: node.winPercentLoss ?? 0,
      fen: node.fen,
      ...(san.length && line && { best: { san, score: line.score } }),
    });
  }

  const biggest = moments.reduce<(typeof moments)[number] | undefined>(
    (top, m) => (!top || m.winPercentLoss > top.winPercentLoss ? m : top),
    undefined,
  );
  return {
    san: nodes.slice(1).map((n) => n.moveSan!),
    evals,
    moments,
    fen: biggest?.fen ?? nodes.at(-1)!.fen,
  };
}

async function classifyAndBranch(ctx: MutationCtx, gameId: Id<'games'>) {
  const nodes = await mainlineOf(ctx, gameId);
  const judged = [];
  for (let i = 1; i < nodes.length; i++) {
    const parent = nodes[i - 1]!;
    const node = nodes[i]!;
    const before = await analysisFor(ctx, parent.positionKey);
    const after = await analysisFor(ctx, node.positionKey);
    if (!before || !after) throw new Error(`Missing analysis around ply ${node.ply}`);
    const mover = parent.fen.split(' ')[1] === 'b' ? ('b' as const) : ('w' as const);
    const verdict = judgeMove({ mover, playedUci: node.moveUci!, before: before.lines, after: scoreOf(after) });
    judged.push({ parent, node, before, mover, verdict });
  }

  const keyMoments = pickKeyMoments(judged.map((j) => ({ mover: j.mover, ...j.verdict })));
  for (const [i, { parent, node, before, verdict }] of judged.entries()) {
    const keyMoment = keyMoments.has(i);
    await ctx.db.patch('nodes', node._id, { ...verdict, keyMoment });
    if (!verdict.critical && !keyMoment) continue;

    // Branch into what should have been played.
    const alternatives = before.lines.filter((l) => l.pv[0] !== node.moveUci).slice(0, BRANCH_ALTERNATIVES);
    for (const line of alternatives) {
      let branchParent = parent._id;
      let ply = parent.ply;
      for (const step of playUciLine(parent.fen, line.pv.slice(0, BRANCH_PLIES))) {
        branchParent = await ctx.db.insert('nodes', {
          gameId,
          parentId: branchParent,
          fen: step.fen,
          positionKey: positionKey(step.fen),
          ply: ++ply,
          moveSan: step.san,
          moveUci: step.uci,
          source: 'engine',
        });
      }
    }
  }
}

/**
 * Re-runs the whole pipeline for a game: drops its engine branches, analyzes any positions that
 * have no saved analysis (e.g. after purgeAnalyses), then classifies again. User what-ifs stay.
 * `npx convex run pipeline:reanalyze '{"gameId": "…"}'`
 */
export const reanalyze = internalMutation({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get('games', gameId);
    if (!game) throw new Error('Game not found');
    if (game.status === 'analyzing') throw new Error('Game is already being analyzed');
    const engineNodes = await ctx.db
      .query('nodes')
      .withIndex('by_gameId_and_source_and_ply', (q) => q.eq('gameId', gameId).eq('source', 'engine'))
      .take(MAX_NODES);
    for (const node of engineNodes) await ctx.db.delete('nodes', node._id);
    await ctx.db.patch('games', gameId, { status: 'analyzing', error: undefined });
    await ctx.scheduler.runAfter(0, internal.engine.analyzeGame, { gameId });
  },
});

/**
 * Deletes every saved analysis made by `engine`, a page at a time (reschedules itself until done).
 * Games that used them need `reanalyze`. `npx convex run pipeline:purgeAnalyses '{"engine": "…"}'`
 */
export const purgeAnalyses = internalMutation({
  args: { engine: v.string(), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { engine, cursor }) => {
    const page = await ctx.db.query('analyses').paginate({ numItems: 200, cursor: cursor ?? null });
    let deleted = 0;
    for (const analysis of page.page) {
      if (analysis.engine === engine) {
        await ctx.db.delete('analyses', analysis._id);
        deleted++;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.pipeline.purgeAnalyses, { engine, cursor: page.continueCursor });
    }
    return { deleted, done: page.isDone };
  },
});

export const markFailed = internalMutation({
  args: { gameId: v.id('games'), error: v.string() },
  handler: async (ctx, { gameId, error }) => {
    // The game may have been deleted while it was being analyzed.
    if (!(await ctx.db.get('games', gameId))) return;
    await ctx.db.patch('games', gameId, { status: 'failed', error });
  },
});
