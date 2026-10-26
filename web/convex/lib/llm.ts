import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderOptions } from '@ai-sdk/provider-utils';

/** Where a user's chat key is from. Each user brings their own (docs/chat.md). */
export type LlmProvider = 'anthropic' | 'openrouter';

export const ANTHROPIC_MODEL = 'claude-opus-5-5';
/** The same model through OpenRouter. */
export const OPENROUTER_MODEL = 'anthropic/claude-opus-5.5';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** The provider a pasted key belongs to, from its prefix, or null if it's neither. */
export function providerOfKey(key: string): LlmProvider | null {
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-or-')) return 'openrouter';
  return null;
}

export const PROVIDER_NAME: Record<LlmProvider, string> = { anthropic: 'Anthropic', openrouter: 'OpenRouter' };

/**
 * Checks a key with a free request (lists models, or reads the key's own info). Returns null if
 * it works, else what to tell the user.
 */
export async function checkKey(provider: LlmProvider, key: string): Promise<string | null> {
  const request =
    provider === 'anthropic'
      ? fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } })
      : fetch(`${OPENROUTER_BASE_URL}/key`, { headers: { authorization: `Bearer ${key}` } });
  let res: Response;
  try {
    res = await request;
  } catch {
    return `Couldn't reach ${PROVIDER_NAME[provider]}. Try again.`;
  }
  if (res.ok) return null;
  if (res.status === 401 || res.status === 403) return `${PROVIDER_NAME[provider]} didn't accept that key.`;
  return `${PROVIDER_NAME[provider]} couldn't check the key (error ${res.status}). Try again.`;
}

type ChatModelConfig = {
  /** A provider model object (AI SDK 6), as the Agent requires. */
  languageModel: ReturnType<ReturnType<typeof createAnthropic>>;
  callSettings: { temperature?: number; maxRetries: number };
  providerOptions?: ProviderOptions;
};

/** The chat model and its call settings for a user's key. The only place that knows the providers. */
export function chatModelConfig(provider: LlmProvider, apiKey: string): ChatModelConfig {
  if (provider === 'anthropic') {
    return {
      languageModel: createAnthropic({ apiKey })(ANTHROPIC_MODEL),
      // Current Claude models reject sampling settings; thinking is adaptive and always on.
      callSettings: { maxRetries: 2 },
      providerOptions: {
        anthropic: {
          // Effort defaults to medium on Opus 5.5; set it so a model change doesn't move it silently.
          effort: 'medium',
          // Reruns a declined reply on a fallback model instead of failing it.
          fallbacks: 'default',
          // Thinking blocks are bound to the exact prompt, tools and history they were written with.
          // Ours change (fact sheet updates, new tools, the 20-message window), so drop stale blocks
          // instead of failing the whole reply.
          thinking: { type: 'adaptive', blockBinding: { prefixMismatchBehavior: 'drop_block' } },
        },
      },
    };
  }

  // OpenRouter's API is OpenAI-compatible.
  const openrouter = createOpenAICompatible({ name: 'openrouter', baseURL: OPENROUTER_BASE_URL, apiKey });
  return { languageModel: openrouter.chatModel(OPENROUTER_MODEL), callSettings: { maxRetries: 2 } };
}
