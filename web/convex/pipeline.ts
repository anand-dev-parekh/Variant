import { v } from 'convex/values';
import { judgeMove, playUciLine, positionKey, terminalScore, type Score } from '@variant/chess-core';
import type { Doc, Id } from './_generated/dataModel';
import { MAX_NODES } from './games';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import { vEngineLine } from './schema';

/** Engine alternatives shown at each critical moment, and how many plies each one runs. */
const BRANCH_ALTERNATIVES = 2;
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
    await ctx.db.patch('games', gameId, { status: 'ready' });
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
  },
});

async function classifyAndBranch(ctx: MutationCtx, gameId: Id<'games'>) {
  const nodes = await mainlineOf(ctx, gameId);
  for (let i = 1; i < nodes.length; i++) {
    const parent = nodes[i - 1]!;
    const node = nodes[i]!;
    const before = await analysisFor(ctx, parent.positionKey);
    const after = await analysisFor(ctx, node.positionKey);
    if (!before || !after) throw new Error(`Missing analysis around ply ${node.ply}`);

    const verdict = judgeMove({
      mover: parent.fen.split(' ')[1] === 'b' ? 'b' : 'w',
      playedUci: node.moveUci!,
      before: before.lines,
      after: scoreOf(after),
    });
    await ctx.db.patch('nodes', node._id, verdict);

    if (verdict.critical) {
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
}

export const markFailed = internalMutation({
  args: { gameId: v.id('games'), error: v.string() },
  handler: async (ctx, { gameId, error }) => {
    await ctx.db.patch('games', gameId, { status: 'failed', error });
  },
});
