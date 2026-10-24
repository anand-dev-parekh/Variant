import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

/**
 * Who may see and change a game (docs/accounts.md): its owner can do everything; anyone holding
 * the game's current share token can view it, chats included, but change nothing. The caller's
 * identity always comes from the auth token, never from an argument.
 */
export type Role = 'owner' | 'viewer';

/** The signed-in user, or null. */
export function currentUserId(ctx: QueryCtx): Promise<Id<'users'> | null> {
  return getAuthUserId(ctx);
}

/** The signed-in user; throws for signed-out callers. */
export async function requireUserId(ctx: QueryCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError('Sign in first.');
  return userId;
}

/** The game and the caller's role in it, or null if the caller may not see it. */
export async function readableGame(
  ctx: QueryCtx,
  gameId: Id<'games'>,
  share?: string,
): Promise<{ game: Doc<'games'>; role: Role } | null> {
  const game = await ctx.db.get('games', gameId);
  if (!game) return null;
  const userId = await getAuthUserId(ctx);
  if (userId && game.ownerId === userId) return { game, role: 'owner' };
  if (share && game.shareToken === share) return { game, role: 'viewer' };
  return null;
}

/** The game, if the caller owns it; otherwise throws as if it didn't exist. */
export async function ownedGame(ctx: QueryCtx, gameId: Id<'games'>): Promise<Doc<'games'>> {
  const access = await readableGame(ctx, gameId);
  if (access?.role !== 'owner') throw new ConvexError('That game no longer exists.');
  return access.game;
}
