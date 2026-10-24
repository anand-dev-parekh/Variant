import { query } from './_generated/server';
import { currentUserId } from './lib/access';

/** The signed-in user's name and picture for the header, or null when signed out. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    const user = userId && (await ctx.db.get('users', userId));
    return user ? { name: user.name ?? user.email ?? 'You', image: user.image ?? null } : null;
  },
});
