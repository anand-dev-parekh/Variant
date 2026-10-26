import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from './_generated/server';
import { currentUserId, requireUserId } from './lib/access';
import { checkKey, PROVIDER_NAME, providerOfKey, type LlmProvider } from './lib/llm';
import { seal } from './lib/secrets';

/**
 * Each user's own LLM key for the chat (docs/chat.md). Stored encrypted, decrypted only in
 * `chat.respond`, and never sent back to the browser: the page sees the provider and last four
 * characters.
 */

const vProvider = v.union(v.literal('anthropic'), v.literal('openrouter'));

function keyRow(ctx: QueryCtx, userId: Id<'users'>) {
  return ctx.db
    .query('apiKeys')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

/** The signed-in user's key as the page may show it, or null without one. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    const row = userId && (await keyRow(ctx, userId));
    return row ? { provider: row.provider, name: PROVIDER_NAME[row.provider], last4: row.last4 } : null;
  },
});

/** Checks a pasted key with its provider, then saves it encrypted (replacing any earlier one). */
export const save = action({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Sign in first.');
    const key = args.key.trim();
    const provider = providerOfKey(key);
    if (!provider) throw new ConvexError('Paste an Anthropic key (sk-ant-…) or an OpenRouter key (sk-or-…).');
    const problem = await checkKey(provider, key);
    if (problem) throw new ConvexError(problem);
    await ctx.runMutation(internal.apiKeys.store, { userId, provider, last4: key.slice(-4), ...(await seal(key, userId)) });
  },
});

export const store = internalMutation({
  args: { userId: v.id('users'), provider: vProvider, last4: v.string(), ciphertext: v.bytes(), iv: v.bytes() },
  handler: async (ctx, { userId, ...fields }) => {
    const row = await keyRow(ctx, userId);
    if (row) await ctx.db.replace('apiKeys', row._id, { userId, ...fields });
    else await ctx.db.insert('apiKeys', { userId, ...fields });
  },
});

/** Deletes the signed-in user's key. */
export const remove = mutation({
  args: {},
  handler: async (ctx) => {
    const row = await keyRow(ctx, await requireUserId(ctx));
    if (row) await ctx.db.delete('apiKeys', row._id);
  },
});

/** The sealed key for the reply action, which decrypts it. */
export const sealedFor = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }): Promise<{ provider: LlmProvider; ciphertext: ArrayBuffer; iv: ArrayBuffer } | null> => {
    const row = await keyRow(ctx, userId);
    return row && { provider: row.provider, ciphertext: row.ciphertext, iv: row.iv };
  },
});

/** Whether a user has a key, for `chat.send`. */
export async function hasKey(ctx: QueryCtx, userId: Id<'users'>): Promise<boolean> {
  return (await keyRow(ctx, userId)) !== null;
}
