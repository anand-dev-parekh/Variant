import { ConvexError, v } from 'convex/values';
import { PgnParseError, parseGame, positionKey } from '@variant/chess-core';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

/** Engine settings for the analysis pass (design doc: depth ~18, MultiPV 3). */
export const ANALYSIS_DEPTH = 18;
export const ANALYSIS_MULTIPV = 3;

/** Imports a PGN: stores the game and its main line, then starts the engine pass. */
export const create = mutation({
  args: { pgn: v.string() },
  handler: async (ctx, { pgn }) => {
    let parsed;
    try {
      parsed = parseGame(pgn);
    } catch (err) {
      if (err instanceof PgnParseError) throw new ConvexError(err.message);
      throw err;
    }

    const gameId = await ctx.db.insert('games', {
      pgn,
      ...parsed.headers,
      status: 'analyzing',
      depth: ANALYSIS_DEPTH,
      multiPv: ANALYSIS_MULTIPV,
    });

    let parentId = await ctx.db.insert('nodes', {
      gameId,
      fen: parsed.startFen,
      positionKey: positionKey(parsed.startFen),
      ply: 0,
      source: 'game',
    });
    for (const p of parsed.plies) {
      parentId = await ctx.db.insert('nodes', {
        gameId,
        parentId,
        fen: p.fenAfter,
        positionKey: positionKey(p.fenAfter),
        ply: p.ply,
        moveSan: p.san,
        moveUci: p.uci,
        source: 'game',
      });
    }

    await ctx.scheduler.runAfter(0, internal.engine.analyzeGame, { gameId });
    return gameId;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query('games').order('desc').take(20);
    return games.map(({ pgn: _pgn, ...game }) => game);
  },
});

/**
 * Everything the game view needs: the game, every node in its tree, and the saved
 * analysis for each position in it, keyed by positionKey.
 */
export const tree = query({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;

    const nodes = await ctx.db
      .query('nodes')
      .withIndex('by_game', (q) => q.eq('gameId', gameId))
      .collect();

    const analyses: Record<string, Doc<'analyses'>> = {};
    for (const key of new Set(nodes.map((n) => n.positionKey))) {
      const analysis = await ctx.db
        .query('analyses')
        .withIndex('by_position', (q) => q.eq('positionKey', key))
        .first();
      if (analysis) analyses[key] = analysis;
    }

    const mainline = new Set(nodes.filter((n) => n.source === 'game').map((n) => n.positionKey));
    const analyzed = [...mainline].filter((key) => analyses[key]).length;

    return {
      game,
      nodes,
      analyses,
      progress: { done: analyzed, total: mainline.size },
    };
  },
});
