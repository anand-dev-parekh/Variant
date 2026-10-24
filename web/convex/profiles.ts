import { ConvexError, v } from 'convex/values';
import { internalQuery, mutation, query } from './_generated/server';
import { currentUserId, requireUserId } from './lib/access';
import { USERNAME } from './lib/chessSites';

/** The signed-in user's chess site usernames, or null when signed out. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique();
    return { lichess: profile?.lichess ?? null, chesscom: profile?.chesscom ?? null };
  },
});

/** Connects or changes a username on one site; an empty string disconnects it. */
export const setUsername = mutation({
  args: { site: v.union(v.literal('lichess'), v.literal('chesscom')), username: v.string() },
  handler: async (ctx, { site, username }) => {
    const userId = await requireUserId(ctx);
    const name = username.trim();
    if (name && !USERNAME.test(name)) throw new ConvexError("That doesn't look like a username.");
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique();
    if (profile) await ctx.db.patch('profiles', profile._id, { [site]: name || undefined });
    else await ctx.db.insert('profiles', { userId, ...(name && { [site]: name }) });
  },
});

/** A user's username on one site, for the import action. */
export const usernameFor = internalQuery({
  args: { userId: v.id('users'), site: v.union(v.literal('lichess'), v.literal('chesscom')) },
  handler: async (ctx, { userId, site }) => {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique();
    return profile?.[site] ?? null;
  },
});
