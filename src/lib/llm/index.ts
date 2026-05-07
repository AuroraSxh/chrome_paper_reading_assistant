import type { ProviderConfig, ProviderId } from '../messages';
import { createOpenAICompat } from './openai-compat';
import { createAnthropic } from './anthropic';
import type { LLMProvider } from './types';

export function createProvider(cfg: ProviderConfig): LLMProvider {
  switch (cfg.id) {
    case 'deepseek':
    case 'openai':
    case 'custom':
      return createOpenAICompat(cfg);
    case 'anthropic':
      return createAnthropic(cfg);
    default:
      throw new Error(`Unknown provider: ${(cfg as { id: ProviderId }).id}`);
  }
}

export const DEFAULT_MODELS: Record<ProviderId, string[]> = {
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  anthropic: ['claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001', 'claude-opus-4-5-20250929'],
  // Generic OpenAI-compatible: model id is fully user-supplied.
  custom: [],
};

export const DEFAULT_BASE_URL: Record<ProviderId, string> = {
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  custom: '',
};

// Friendly display labels for known model ids (per provider). Anything not
// listed here falls back to the raw id.
export const MODEL_LABELS: Record<ProviderId, Record<string, string>> = {
  deepseek: {
    'deepseek-v4-pro': 'DeepSeek V4 Pro · 思考模式',
    'deepseek-v4-flash': 'DeepSeek V4 Flash · 快速',
  },
  openai: {
    'gpt-4o-mini': 'GPT-4o mini',
    'gpt-4o': 'GPT-4o',
    'gpt-4.1-mini': 'GPT-4.1 mini',
  },
  anthropic: {
    'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
    'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
    'claude-opus-4-5-20250929': 'Claude Opus 4.5',
  },
  custom: {},
};

export function modelLabel(provider: ProviderId, id: string): string {
  return MODEL_LABELS[provider]?.[id] ?? id;
}
