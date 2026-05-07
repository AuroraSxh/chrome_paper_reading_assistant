import type { ProviderConfig } from '../messages';
import type { ChatOptions, LLMProvider } from './types';
import { iterSSE } from './stream';

export function createOpenAICompat(cfg: ProviderConfig): LLMProvider {
  const baseURL = (cfg.baseURL || (cfg.id === 'deepseek'
    ? 'https://api.deepseek.com/v1'
    : 'https://api.openai.com/v1')).replace(/\/$/, '');

  return {
    async chat({ messages, model, signal, onDelta }: ChatOptions) {
      const isDeepSeek = cfg.id === 'deepseek';
      // DeepSeek v4-pro / v4-flash share an OpenAI-compatible /chat/completions
      // endpoint. v4-pro supports an explicit "thinking" mode that returns
      // chain-of-thought via delta.reasoning_content. We DON'T enable thinking
      // for chat (cheaper + cleaner output) but DO enable it for the summary
      // channel where deeper reasoning helps. Caller can override via cfg.
      // Deprecated by DeepSeek docs: frequency_penalty / presence_penalty —
      // we don't send them.
      const body: Record<string, unknown> = {
        model,
        messages,
        stream: true,
      };
      if (cfg.maxTokens) body.max_tokens = cfg.maxTokens;
      if (isDeepSeek && /pro/i.test(model)) {
        // Enable thinking mode on pro by default; reasoning_content is dropped
        // before persisting (see iterSSE handler below).
        body.thinking = { type: 'enabled' };
      }
      const url = `${baseURL}/chat/completions`;
      const init: RequestInit = {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
      };
      // Retry once on transient network failures ("Failed to fetch") which
      // are common when DeepSeek/OpenAI proxy briefly drops a connection.
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
        if (evt.data === '[DONE]') break;
        try {
          const json = JSON.parse(evt.data);
          const choice = json?.choices?.[0];
          const delta = choice?.delta?.content;
          // deepseek-reasoner returns chain-of-thought in `reasoning_content`.
          // We intentionally drop it: persisting CoT into chat history would
          // bloat token usage on follow-ups and confuse the model.
          if (typeof delta === 'string' && delta) {
            full += delta;
            onDelta(delta);
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason;
        } catch {
          // ignore unparseable keepalives
        }
      }
      return { fullText: full, finishReason };
    },
  };
}
