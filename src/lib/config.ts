import type { AppConfig, ProviderId } from './messages';
import { DEFAULT_BASE_URL, DEFAULT_MODELS } from './llm';

const KEY = 'app_config_v1';

export const defaultConfig: AppConfig = {
  activeProvider: 'deepseek',
  providers: {
    deepseek: { id: 'deepseek', apiKey: '', baseURL: DEFAULT_BASE_URL.deepseek, defaultModel: DEFAULT_MODELS.deepseek[0] },
    openai: { id: 'openai', apiKey: '', baseURL: DEFAULT_BASE_URL.openai, defaultModel: DEFAULT_MODELS.openai[0] },
    anthropic: { id: 'anthropic', apiKey: '', baseURL: DEFAULT_BASE_URL.anthropic, defaultModel: DEFAULT_MODELS.anthropic[0] },
    custom: { id: 'custom', apiKey: '', baseURL: '', defaultModel: '' },
  },
};

export async function loadConfig(): Promise<AppConfig> {
  const stored = await chrome.storage.local.get(KEY);
  const raw = stored[KEY];
  if (!raw) return defaultConfig;
  return {
    activeProvider: raw.activeProvider ?? defaultConfig.activeProvider,
    providers: {
      ...defaultConfig.providers,
      ...(raw.providers ?? {}),
    },
  };
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await chrome.storage.local.set({ [KEY]: cfg });
}

export function getActiveProvider(cfg: AppConfig): ProviderId {
  return cfg.activeProvider;
}
