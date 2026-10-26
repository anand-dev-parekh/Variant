import agent from '@convex-dev/agent/convex.config';
import { defineApp } from 'convex/server';
import { v } from 'convex/values';

const app = defineApp({
  env: {
    /** Native engine service (engine/server.mjs). Required for analysis; see docs/engines.md. */
    ENGINE_URL: v.optional(v.string()),
    ENGINE_TOKEN: v.optional(v.string()),
    /** Encrypts users' own chat keys at rest: 32 random bytes, base64. See docs/chat.md. */
    KEY_ENCRYPTION_SECRET: v.optional(v.string()),
    /** Convex Auth (docs/accounts.md): where OAuth redirects back to, the token signing keys, and the OAuth apps. */
    SITE_URL: v.optional(v.string()),
    JWT_PRIVATE_KEY: v.optional(v.string()),
    JWKS: v.optional(v.string()),
    AUTH_GITHUB_ID: v.optional(v.string()),
    AUTH_GITHUB_SECRET: v.optional(v.string()),
    AUTH_GOOGLE_ID: v.optional(v.string()),
    AUTH_GOOGLE_SECRET: v.optional(v.string()),
  },
});

/** Chat threads, messages and streamed replies (Convex Agent component). */
app.use(agent);

export default app;
