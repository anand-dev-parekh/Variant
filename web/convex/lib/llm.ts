import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { env } from '../_generated/server';

/** NVIDIA NIM's hosted, OpenAI-compatible API. */
const NIM_BASE_URL = 'https://integrate.api.nvidia.com/v1';
/** Must return standard OpenAI tool calls: some NIM models (DeepSeek V4.1 Flash) emit raw tool tokens as text. */
export const DEFAULT_NIM_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

type ChatModelConfig = {
  /** A provider model object (AI SDK 6), as the Agent requires. */
  languageModel: ReturnType<ReturnType<typeof createAnthropic>>;
  callSettings: { temperature?: number; maxRetries: number };
  providerOptions?: { anthropic: Record<string, string> };
};

/**
 * The chat model and its call settings, from LLM_PROVIDER (`anthropic`, or NVIDIA NIM by default),
 * LLM_MODEL and the provider's key. The only place that knows the provider. LLM_BASE_URL points
 * the NIM path at any other OpenAI-compatible API.
 */
export function chatModelConfig(): ChatModelConfig {
  if (env.LLM_PROVIDER === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Chat not configured: set ANTHROPIC_API_KEY (see docs/chat.md)');
    return {
      languageModel: createAnthropic({ apiKey })(env.LLM_MODEL ?? DEFAULT_ANTHROPIC_MODEL),
      // Current Claude models reject sampling settings; thinking is adaptive and always on.
      callSettings: { maxRetries: 2 },
      // Effort defaults to medium on Opus 5.5; set it so a model change doesn't move it silently.
      // `fallbacks: 'default'` reruns a declined reply on a fallback model instead of failing it.
      providerOptions: { anthropic: { effort: 'medium', fallbacks: 'default' } },
    };
  }

  const apiKey = env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('Chat not configured: set NVIDIA_API_KEY (see docs/chat.md)');
  const provider = createOpenAICompatible({ name: 'nim', baseURL: env.LLM_BASE_URL ?? NIM_BASE_URL, apiKey });
  return {
    languageModel: provider.chatModel(env.LLM_MODEL ?? DEFAULT_NIM_MODEL),
    // NIM's free tier is often briefly overloaded (503); the AI SDK backs off between retries.
    callSettings: { temperature: 0.3, maxRetries: 4 },
  };
}
