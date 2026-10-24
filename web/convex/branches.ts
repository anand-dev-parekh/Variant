import { ConvexError, v } from 'convex/values';
import { judgeMove, playUciLine, positionKey, sideToMove } from '@variant/chess-core';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, mutation, type MutationCtx } from './_generated/server';
import { MAX_NODES } from './games';
import { ownedGame } from './lib/access';
import { analyzeCached, scoreOfAnalysis } from './lib/cachedEngine';
import { vClassification } from './schema';

/** Longest line added in one go (a dragged move is one; the chat's add_branch may add a few). */
const MAX_LINE = 20;

/**
 * Plays UCI moves from a node, reusing any child that already has the move (played, engine or
 * user) and adding the rest as `user` nodes. Returns the last node; new nodes get analyzed.
 */
export const addMoves = mutation({
  args: { parentId: v.id('nodes'), moves: v.array(v.string()) },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get('nodes', args.parentId);
    if (!parent) throw new ConvexError('That position no longer exists.');
    await ownedGame(ctx, parent.gameId);
    return addLine(ctx, args);
  },
});

/** The same for the chat's add_branch tool, which only runs in the owner's own chat. */
export const addMovesInternal = internalMutation({
  args: { parentId: v.id('nodes'), moves: v.array(v.string()) },
  handler: (ctx, args) => addLine(ctx, args),
});

async function addLine(
  ctx: MutationCtx,
  { parentId, moves }: { parentId: Id<'nodes'>; moves: string[] },
): Promise<Id<'nodes'>> {
  if (moves.length === 0 || moves.length > MAX_LINE) throw new ConvexError(`Add between 1 and ${MAX_LINE} moves.`);
  const parent = await ctx.db.get('nodes', parentId);
  if (!parent) throw new ConvexError('That position no longer exists.');
  const game = await ctx.db.get('games', parent.gameId);
  if (game?.status !== 'ready') throw new ConvexError('Moves can be added once the game is analyzed.');

  const steps = playUciLine(parent.fen, moves);
  if (steps.length < moves.length) throw new ConvexError(`${moves[steps.length]} is not a legal move there.`);

  const size = await ctx.db
    .query('nodes')
    .withIndex('by_gameId_and_ply', (q) => q.eq('gameId', parent.gameId))
    .take(MAX_NODES);
  if (size.length + moves.length > MAX_NODES) throw new ConvexError('This game has too many positions to add more.');

  let at: Doc<'nodes'> = parent;
  const added: Id<'nodes'>[] = [];
  for (const step of steps) {
    const children = await ctx.db
      .query('nodes')
      .withIndex('by_parentId', (q) => q.eq('parentId', at._id))
      .take(MAX_NODES);
    const existing = children.find((c) => c.moveUci === step.uci);
    if (existing) {
      at = existing;
      continue;
    }
    const id = await ctx.db.insert('nodes', {
      gameId: parent.gameId,
      parentId: at._id,
      fen: step.fen,
      positionKey: positionKey(step.fen),
      ply: at.ply + 1,
      moveSan: step.san,
      moveUci: step.uci,
      source: 'user',
    });
    added.push(id);
    at = (await ctx.db.get('nodes', id))!;
  }
  if (added.length) await ctx.scheduler.runAfter(0, internal.branches.analyzeUserMoves, { nodeIds: added });
  return at._id;
}

/** Server analysis for new what-if positions, then a verdict on each move, like game moves get. */
export const analyzeUserMoves = internalAction({
  args: { nodeIds: v.array(v.id('nodes')) },
  handler: async (ctx, { nodeIds }) => {
    for (const nodeId of nodeIds) {
      const pair = await ctx.runQuery(internal.branches.withParent, { nodeId });
      if (!pair) continue;
      try {
        const before = await analyzeCached(ctx, pair.parent.fen);
        const after = await analyzeCached(ctx, pair.node.fen);
        const afterScore = scoreOfAnalysis(after);
        if (!before.lines.length || !afterScore) continue;
        const verdict = judgeMove({
          mover: sideToMove(pair.parent.fen),
          playedUci: pair.node.moveUci!,
          before: before.lines,
          after: afterScore,
        });
        await ctx.runMutation(internal.branches.saveVerdict, {
          nodeId,
          classification: verdict.classification,
          winPercentLoss: verdict.winPercentLoss,
          onlyMove: verdict.onlyMove,
        });
      } catch (err) {
        // The browser engine still shows live evals; only the verdict is missing.
        console.error('analyzeUserMoves failed', nodeId, err);
      }
    }
  },
});

export const withParent = internalQuery({
  args: { nodeId: v.id('nodes') },
  handler: async (ctx, { nodeId }) => {
    const node = await ctx.db.get('nodes', nodeId);
    const parent = node?.parentId ? await ctx.db.get('nodes', node.parentId) : null;
    return node && parent ? { node, parent } : null;
  },
});

export const saveVerdict = internalMutation({
  args: {
    nodeId: v.id('nodes'),
    classification: vClassification,
    winPercentLoss: v.number(),
    onlyMove: v.boolean(),
  },
  handler: async (ctx, { nodeId, ...verdict }) => {
    // The node may have been removed while it was being analyzed.
    if (await ctx.db.get('nodes', nodeId)) await ctx.db.patch('nodes', nodeId, verdict);
  },
});

/** Deletes a what-if and everything after it, with their chat threads. Returns the parent. */
export const removeWhatIf = mutation({
  args: { nodeId: v.id('nodes') },
  handler: async (ctx, { nodeId }) => {
    const node = await ctx.db.get('nodes', nodeId);
    if (!node) return null;
    await ownedGame(ctx, node.gameId);
    if (node.source !== 'user') throw new ConvexError('Only your own what-ifs can be removed.');

    const stack: Id<'nodes'>[] = [nodeId];
    for (let id = stack.pop(); id; id = stack.pop()) {
      const children = await ctx.db
        .query('nodes')
        .withIndex('by_parentId', (q) => q.eq('parentId', id))
        .take(MAX_NODES);
      stack.push(...children.map((c) => c._id));
      const threads = await ctx.db
        .query('threads')
        .withIndex('by_nodeId', (q) => q.eq('nodeId', id))
        .take(10);
      for (const t of threads) await ctx.db.delete('threads', t._id);
      await ctx.db.delete('nodes', id);
    }
    return node.parentId ?? null;
  },
});
