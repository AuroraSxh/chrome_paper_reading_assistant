import { create } from 'zustand';
import type { AppConfig, Article, ProviderId } from '../lib/messages';
import { defaultConfig, loadConfig, saveConfig } from '../lib/config';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
}

interface AppState {
  cfg: AppConfig;
  tabId: number | null;
  article: Article | null;
  loadingArticle: boolean;
  extractRequestId: string | null;
  errorMsg: string | null;

  chat: ChatTurn[];
  chatStream: { requestId: string | null };

  provider: ProviderId;
  model: string;

  setTabId: (id: number | null) => void;
  setArticle: (a: Article | null) => void;
  setLoadingArticle: (b: boolean) => void;
  setExtractRequestId: (id: string | null) => void;
  setError: (m: string | null) => void;

  startChat: (requestId: string, userText: string) => void;
  appendChatDelta: (rid: string, s: string) => void;
  finalizeChat: (rid: string) => void;
  resetChat: () => void;

  resetForArticle: () => void;

  loadInitialConfig: () => Promise<void>;
  setProvider: (p: ProviderId) => Promise<void>;
  setModel: (m: string) => Promise<void>;
  reloadCfg: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  cfg: defaultConfig,
  tabId: null,
  article: null,
  loadingArticle: false,
  extractRequestId: null,
  errorMsg: null,
  chat: [],
  chatStream: { requestId: null },
  provider: defaultConfig.activeProvider,
  model: defaultConfig.providers[defaultConfig.activeProvider].defaultModel,

  setTabId: (id) => set({ tabId: id }),
  setArticle: (a) => set({ article: a, loadingArticle: false }),
  setLoadingArticle: (b) => set({ loadingArticle: b }),
  setExtractRequestId: (id) => set({ extractRequestId: id }),
  setError: (m) => set({ errorMsg: m }),

  startChat: (requestId, userText) => set({
    chat: [...get().chat, { role: 'user', content: userText }, { role: 'assistant', content: '', pending: true }],
    chatStream: { requestId },
    errorMsg: null,
  }),
  appendChatDelta: (rid, s) => {
    if (get().chatStream.requestId !== rid) return;
    const arr = [...get().chat];
    const last = arr[arr.length - 1];
    if (last && last.role === 'assistant') {
      arr[arr.length - 1] = { ...last, content: last.content + s };
      set({ chat: arr });
    }
  },
  finalizeChat: (rid) => {
    if (get().chatStream.requestId !== rid) return;
    const arr = [...get().chat];
    const last = arr[arr.length - 1];
    if (last && last.role === 'assistant') {
      arr[arr.length - 1] = { ...last, pending: false };
      set({ chat: arr, chatStream: { requestId: null } });
    } else {
      set({ chatStream: { requestId: null } });
    }
  },
  resetChat: () => set({ chat: [], chatStream: { requestId: null } }),

  resetForArticle: () => set({
    chat: [],
    chatStream: { requestId: null },
    errorMsg: null,
  }),

  loadInitialConfig: async () => {
    const cfg = await loadConfig();
    set({ cfg, provider: cfg.activeProvider, model: cfg.providers[cfg.activeProvider].defaultModel });
  },
  reloadCfg: async () => {
    const cfg = await loadConfig();
    set({ cfg });
  },
  setProvider: async (p) => {
    const cfg: AppConfig = { ...get().cfg, activeProvider: p };
    set({ cfg, provider: p, model: cfg.providers[p].defaultModel });
    await saveConfig(cfg);
  },
  setModel: async (m) => {
    const p = get().provider;
    const cfg: AppConfig = {
      ...get().cfg,
      providers: { ...get().cfg.providers, [p]: { ...get().cfg.providers[p], defaultModel: m } },
    };
    set({ cfg, model: m });
    await saveConfig(cfg);
  },
}));
