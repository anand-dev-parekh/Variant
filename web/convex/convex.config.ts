import agent from '@convex-dev/agent/convex.config';
import { defineApp } from 'convex/server';
import { v } from 'convex/values';

const app = defineApp({
  env: {
    /** Native engine service (engine/server.mjs). Required for analysis; see docs/engines.md. */
    ENGINE_URL: v.optional(v.string()),
    ENGINE_TOKEN: v.optional(v.string()),
    /** LLM for node chat: `anthropic`, or NVIDIA NIM / any OpenAI-compatible API by default. See docs/chat.md. */
    LLM_PROVIDER: v.optional(v.string()),
    ANTHROPIC_API_KEY: v.optional(v.string()),
    NVIDIA_API_KEY: v.optional(v.string()),
    LLM_MODEL: v.optional(v.string()),
    LLM_BASE_URL: v.optional(v.string()),
  },
});

/** Chat threads, messages and streamed replies (Convex Agent component). */
app.use(agent);

export default app;
