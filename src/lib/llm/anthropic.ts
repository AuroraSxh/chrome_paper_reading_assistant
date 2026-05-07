import type { ProviderConfig } from '../messages';
import type { ChatOptions, LLMProvider } from './types';
import { iterSSE } from './stream';

export function createAnthropic(cfg: ProviderConfig): LLMProvider {
  const baseURL = (cfg.baseURL || 'https://api.anthropic.com').replace(/\/$/, '');
  return {
    async chat({ messages, model, signal, onDelta }: ChatOptions) {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const turns = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }));
      const init: RequestInit = {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: cfg.maxTokens ?? 4096,
          system: system || undefined,
          messages: turns,
          stream: true,
        }),
      };
      const url = `${baseURL}/v1/messages`;
      let res: Response;
      try {
        res = await fetch(url, init);
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        const msg = e instanceof Error ? e.message : String(e);
        if (/Failed to fetch|NetworkError|network|ECONN/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 800));
          res = await fetch(url, init);
        } else {
          throw e;
        }
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/event-stream')) {
        const text = await res.text().catch(() => '');
        throw new Error(`Expected SSE, got ${ct}: ${text.slice(0, 500)}`);
      }
      let full = '';
      let finishReason: string | undefined;
      for await (const evt of iterSSE(res)) {
        if (!evt.data) continue;
        let payload: any;
        try { payload = JSON.parse(evt.data); } catch { continue; }
        const t = payload?.type;
        if (t === 'content_block_delta') {
          const delta = payload?.delta?.text;
          if (typeof delta === 'string' && delta) {
            full += delta;
            onDelta(delta);
          }
        } else if (t === 'message_delta') {
          if (payload?.delta?.stop_reason) finishReason = payload.delta.stop_reason;
        } else if (t === 'error') {
          const msg = payload?.error?.message || 'anthropic stream error';
          throw new Error(msg);
        } else if (t === 'message_stop') {
          break;
        }
      }
      return { fullText: full, finishReason };
    },
  };
}
