export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface Article {
  url: string;
  doi?: string;
  title: string;
  journal?: string;
  authors?: string[];
  abstract?: string;
  fullText: string;
  publishedAt?: string;
  source: string;
  extractedAt: number;
  kind?: 'html' | 'pdf';
}

export type ProviderId = 'deepseek' | 'openai' | 'anthropic' | 'custom';

export interface ProviderConfig {
  id: ProviderId;
  apiKey: string;
  baseURL?: string;
  defaultModel: string;
  maxTokens?: number;
}

export interface AppConfig {
  activeProvider: ProviderId;
  providers: Record<ProviderId, ProviderConfig>;
  contextMaxChars?: number;
}

export type ContentRequest =
  | { type: 'EXTRACT_ARTICLE' }
  | { type: 'GET_SELECTION' };

export type ContentResponse =
  | { ok: true; article: Article }
  | { ok: true; selection: string }
  | { ok: false; error: string };

export type StreamChannel = 'summary' | 'chat';

export type PanelToBg =
  | { type: 'EXTRACT'; tabId: number; requestId: string }
  | { type: 'GET_SELECTION'; tabId: number; requestId: string }
  | {
      type: 'CHAT';
      requestId: string;
      channel: StreamChannel;
      messages: ChatMessage[];
      provider: ProviderId;
      model: string;
      // Optional articleId so background can persist results to DB even if
      // the side panel is closed mid-stream.
      articleId?: string;
    }
  | { type: 'ABORT'; requestId: string };

export type BgToPanel =
  | { type: 'ARTICLE'; requestId: string; article: Article }
  | { type: 'SELECTION'; requestId: string; text: string }
  | { type: 'DELTA'; requestId: string; channel: StreamChannel; text: string }
  | { type: 'DONE'; requestId: string; channel: StreamChannel; fullText: string; finishReason?: string }
  | { type: 'ABORTED'; requestId: string; channel?: StreamChannel }
  | { type: 'ERROR'; requestId: string; channel?: StreamChannel; message: string };

export const PORT_NAME = 'paper-ai-port';

export function newRequestId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
