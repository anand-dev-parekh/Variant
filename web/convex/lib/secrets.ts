import type { Id } from '../_generated/dataModel';
import { env } from '../_generated/server';

/**
 * AES-256-GCM for users' LLM keys at rest (docs/chat.md). The secret is `KEY_ENCRYPTION_SECRET`
 * (32 random bytes, base64), which only the deployment has. The user's id is bound in as
 * additional data, so a ciphertext copied onto another user's row won't decrypt.
 */
export type Sealed = { ciphertext: ArrayBuffer; iv: ArrayBuffer };

async function aesKey(): Promise<CryptoKey> {
  const secret = env.KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error('Keys not configured: set KEY_ENCRYPTION_SECRET (see docs/chat.md)');
  const raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('KEY_ENCRYPTION_SECRET must be 32 bytes, base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

const bound = (userId: Id<'users'>) => new TextEncoder().encode(userId);

export async function seal(plain: string, userId: Id<'users'>): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: bound(userId) },
    await aesKey(),
    new TextEncoder().encode(plain),
  );
  return { ciphertext, iv: iv.buffer };
}

export async function unseal({ ciphertext, iv }: Sealed, userId: Id<'users'>): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv), additionalData: bound(userId) },
    await aesKey(),
    ciphertext,
  );
  return new TextDecoder().decode(plain);
}
