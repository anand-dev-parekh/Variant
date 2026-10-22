import { defineApp } from 'convex/server';
import { v } from 'convex/values';

const app = defineApp({
  env: {
    /** Native engine service (engine/server.mjs). Without both, analysis uses WASM Stockfish in a Node action. */
    ENGINE_URL: v.optional(v.string()),
    ENGINE_TOKEN: v.optional(v.string()),
  },
});

export default app;
