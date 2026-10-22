import { defineApp } from 'convex/server';
import { v } from 'convex/values';

const app = defineApp({
  env: {
    /** Native engine service (engine/server.mjs). Required for analysis; see docs/engines.md. */
    ENGINE_URL: v.optional(v.string()),
    ENGINE_TOKEN: v.optional(v.string()),
  },
});

export default app;
