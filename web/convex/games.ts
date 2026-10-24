import { ConvexError, v } from 'convex/values';
import { PgnParseError, parseGame, positionKey } from '@variant/chess-core';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import { currentUserId, ownedGame, readableGame, requireUserId } from './lib/access';
import { vSite } from './schema';

/** Upper bound on a game's tree: main line plus engine and user branches. */
export const MAX_NODES = 4000;

/** Engine settings for the analysis pass (design doc: depth ~18, MultiPV 3). */
export const ANALYSIS_DEPTH = 18;
export const ANALYSIS_MULTIPV = 3;

/**
 * Imports a PGN for the signed-in user: stores the game and its main line, then starts the engine
 * pass. A game imported from a chess site (`origin`) that the user already has is returned as is.
 */
export const create = mutation({
  args: { pgn: v.string(), origin: v.optional(v.object({ site: vSite, id: v.string() })) },
  handler: async (ctx, { pgn, origin }) => {
    const ownerId = await requireUserId(ctx);
    if (origin) {
      const existing = await ctx.db
        .query('games')
        .withIndex('by_ownerId_and_origin', (q) =>
          q.eq('ownerId', ownerId).eq('origin.site', origin.site).eq('origin.id', origin.id),
        )
        .first();
      if (existing) return existing._id;
    }

    let parsed;
    try {
      parsed = parseGame(pgn);
    } catch (err) {
      if (err instanceof PgnParseError) throw new ConvexError(err.message);
      throw err;
    }

    const gameId = await ctx.db.insert('games', {
      ownerId,
      ...(origin && { origin }),
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

/** The signed-in user's games, newest first; empty when signed out. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await currentUserId(ctx);
    if (!ownerId) return [];
    const games = await ctx.db
      .query('games')
      .withIndex('by_ownerId', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .take(50);
    return games.map(({ pgn: _pgn, shareToken: _token, ...game }) => game);
  },
});

/** The caller's games imported from a site, as site game id → game id, to mark them in the import list. */
export const importedFrom = query({
  args: { site: vSite },
  handler: async (ctx, { site }) => {
    const ownerId = await currentUserId(ctx);
    if (!ownerId) return {};
    const games = await ctx.db
      .query('games')
      .withIndex('by_ownerId_and_origin', (q) => q.eq('ownerId', ownerId).eq('origin.site', site))
      .take(500);
    return Object.fromEntries(games.map((g) => [g.origin!.id, g._id]));
  },
});

/** Turns the game's share link on (a new token) or off (revoking the old link). Returns the token. */
export const setSharing = mutation({
  args: { gameId: v.id('games'), enabled: v.boolean() },
  handler: async (ctx, { gameId, enabled }) => {
    const game = await ownedGame(ctx, gameId);
    if (!enabled) {
      await ctx.db.patch('games', gameId, { shareToken: undefined });
      return null;
    }
    const shareToken = game.shareToken ?? crypto.randomUUID().replaceAll('-', '');
    await ctx.db.patch('games', gameId, { shareToken });
    return shareToken;
  },
});

/**
 * One-off: gives every game without an owner (imported before accounts) to the user with this
 * email. `npx convex run games:claimUnowned '{"email": "…"}'`
 */
export const claimUnowned = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .unique();
    if (!user) throw new ConvexError(`No user with email ${email}; sign in once first.`);
    let claimed = 0;
    for (const game of await ctx.db.query('games').take(1000)) {
      if (game.ownerId) continue;
      await ctx.db.patch('games', game._id, { ownerId: user._id });
      claimed++;
    }
    return claimed;
  },
});

/**
 * Everything the game view needs: the game, every node in its tree, and the saved
 * analysis for each position in it, keyed by positionKey.
 */
export const tree = query({
  args: { gameId: v.id('games'), share: v.optional(v.string()) },
  handler: async (ctx, { gameId, share }) => {
    const access = await readableGame(ctx, gameId, share);
    if (!access) return null;
    const { game: full, role } = access;
    // Viewers don't get the share token or the raw PGN.
    const { shareToken, pgn: _pgn, ...game } = full;
    const owner = full.ownerId ? await ctx.db.get('users', full.ownerId) : null;

    const nodes = await ctx.db
      .query('nodes')
      .withIndex('by_gameId_and_ply', (q) => q.eq('gameId', gameId))
      .take(MAX_NODES);

    const analyses: Record<string, Doc<'analyses'>> = {};
    for (const key of new Set(nodes.map((n) => n.positionKey))) {
      const analysis = await ctx.db
        .query('analyses')
        .withIndex('by_positionKey', (q) => q.eq('positionKey', key))
        .first();
      if (analysis) analyses[key] = analysis;
    }

    const mainline = new Set(nodes.filter((n) => n.source === 'game').map((n) => n.positionKey));
    const analyzed = [...mainline].filter((key) => analyses[key]).length;

    // Moves the player has asked the coach about (a thread exists once a question is sent).
    const threads = await ctx.db
      .query('threads')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .take(MAX_NODES);

    return {
      game,
      role,
      ownerName: owner?.name ?? null,
      shareToken: role === 'owner' ? (shareToken ?? null) : null,
      nodes,
      analyses,
      chatted: threads.map((t) => t.nodeId),
      progress: { done: analyzed, total: mainline.size },
    };
  },
});
