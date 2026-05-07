import type { ChatMessage, ProviderConfig } from '../messages';

export interface ChatOptions {
  messages: ChatMessage[];
  model: string;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

export interface LLMProvider {
  chat(opts: ChatOptions): Promise<{ fullText: string; finishReason?: string }>;
}

export type ProviderFactory = (cfg: ProviderConfig) => LLMProvider;
