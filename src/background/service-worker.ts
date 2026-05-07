import type { BgToPanel, ContentRequest, ContentResponse, PanelToBg } from '../lib/messages';
import { PORT_NAME } from '../lib/messages';
import { loadConfig } from '../lib/config';
import { createProvider } from '../lib/llm';
import { db } from '../lib/db/schema';
import { extractMemoriesFromTurn, rebuildMemoryIndex, MEMORY_REBUILD_TURN_THRESHOLD } from '../lib/memory';
import type { ChatMessage } from '../lib/messages';

const SIDE_PANEL_PATH = 'src/sidepanel/index.html';

const SUPPORTED_HOSTS_RE = /(^|\.)(nature\.com|cell\.com|science\.org|sciencedirect\.com|wiley\.com|springer\.com|pnas\.org|plos\.org|oup\.com|acs\.org|rsc\.org|embopress\.org|elifesciences\.org|biorxiv\.org|medrxiv\.org)$/i;

function isSupportedUrl(u: string | undefined | null): boolean {
  if (!u) return false;
  // Adobe Acrobat extension's wrapped PDF URL.
  if (/^chrome-extension:\/\/[a-z]+\/file:\/\/\/.+\.pdf/i.test(u)) return true;
  // Local PDF via Chrome built-in viewer.
  if (/^file:\/\/\/.+\.pdf(?:$|\?|#)/i.test(u)) return true;
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (/\.pdf(?:$|\?|#)/i.test(url.pathname + url.search)) return true;
    return SUPPORTED_HOSTS_RE.test(url.hostname);
  } catch { return false; }
}

async function disablePanelForTab(tabId: number): Promise<void> {
  try { await chrome.sidePanel.setOptions({ tabId, enabled: false }); } catch { /* tab gone */ }
}

async function enablePanelForTab(tabId: number): Promise<void> {
  try { await chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: true }); } catch { /* tab gone */ }
}

async function initGlobals(): Promise<void> {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }); } catch (e) { console.warn('[paper-ai] setPanelBehavior', e); }
  // Global default: no panel anywhere. setOptions without tabId requires
  // path to be present even when disabled in some Chrome versions.
  try {
    await chrome.sidePanel.setOptions({ path: SIDE_PANEL_PATH, enabled: false });
  } catch (e) {
    console.warn('[paper-ai] setOptions global', e);
  }
}
chrome.runtime.onInstalled.addListener(initGlobals);
chrome.runtime.onStartup.addListener(initGlobals);
// Also run on every SW spawn (top-level), but lazily so import-time errors
// don't break extension startup.
queueMicrotask(() => { void initGlobals(); });

// Action click MUST be synchronous w.r.t. the user gesture for
// chrome.sidePanel.open() to succeed. We pre-set per-tab options on URL
// change/activation below, so by the time the user clicks we can call
// open() directly.
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id == null) return;
  if (!isSupportedUrl(tab.url)) return;
  // Fire-and-forget: do NOT await; the gesture is alive only synchronously.
  chrome.sidePanel.open({ tabId: tab.id }).catch((e) => console.warn('[paper-ai] open', e));
});

// Pre-emptively register/unregister the panel per tab so action click can
// open it instantly. Supported URL → enabled; otherwise → disabled (panel
// hides if previously open in window).
async function syncPanelForTab(tabId: number, url: string | undefined): Promise<void> {
  if (isSupportedUrl(url)) await enablePanelForTab(tabId);
  else await disablePanelForTab(tabId);
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === 'complete') {
    void syncPanelForTab(tabId, change.url ?? tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (info) => {
  try {
    const tab = await chrome.tabs.get(info.tabId);
    await syncPanelForTab(info.tabId, tab.url);
  } catch { /* tab gone */ }
});

// Initial sync for tabs already open when SW spawned.
chrome.tabs.query({}).then((tabs) => {
  for (const t of tabs) {
    if (t.id != null) void syncPanelForTab(t.id, t.url);
  }
}).catch(() => {});

function sendToTab(tabId: number, req: ContentRequest, timeoutMs = 4000): Promise<ContentResponse> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ ok: false, error: '内容脚本无响应（可能是非期刊页面或仍在加载）' });
    }, timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, req, (resp) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const err = chrome.runtime.lastError;
        if (err) {
          const m = err.message || 'runtime error';
          const friendly = /Receiving end does not exist|Could not establish connection/i.test(m)
            ? '当前标签页未注入扩展脚本。请按 F5 刷新该页面后重试（刚装/刚更新扩展时，已打开的标签页需要刷新一次）。'
            : m;
          resolve({ ok: false, error: friendly });
        } else resolve(resp as ContentResponse);
      });
    } catch (e) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

interface InflightEntry {
  ctrl: AbortController;
  channel: 'summary' | 'chat';
  articleId?: string;
  model: string;
  provider: string;
  port: chrome.runtime.Port | null;
}
const inflight = new Map<string, InflightEntry>();

async function persistResult(entry: InflightEntry, fullText: string, originalUserMessages: ChatMessage[]): Promise<void> {
  if (!entry.articleId || !fullText.trim()) return;
  try {
    if (entry.channel === 'summary') {
      await db.summaries.add({
        articleId: entry.articleId,
        model: entry.model,
        provider: entry.provider,
        content: fullText,
        createdAt: Date.now(),
      });
    } else if (entry.channel === 'chat') {
      const conv = await db.conversations
        .where('articleId').equals(entry.articleId)
        .reverse().sortBy('updatedAt').then((r) => r[0]);
      let convId = conv?.id;
      if (convId == null) {
        convId = (await db.conversations.add({
          articleId: entry.articleId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })) as number;
      }
      await db.messages.add({
        conversationId: convId,
        role: 'assistant',
        content: fullText,
        createdAt: Date.now(),
      });
      await db.conversations.update(convId, { updatedAt: Date.now() });
      // Fire-and-forget long-term memory extraction. Never block chat reply.
      void extractAndIndexMemories(entry.articleId, originalUserMessages, fullText);
    }
  } catch (e) {
    console.warn('[paper-ai] persistResult failed', e);
  }
}

async function extractAndIndexMemories(articleId: string, sentMessages: ChatMessage[], assistantReply: string): Promise<void> {
  try {
    const article = await db.articles.get(articleId);
    if (!article) return;
    const recent: ChatMessage[] = [
      ...sentMessages.filter((m) => m.role !== 'system').slice(-4),
      { role: 'assistant', content: assistantReply },
    ];
    const saved = await extractMemoriesFromTurn({ article, recentMessages: recent });
    if (saved.length === 0) return;
    // Count message turns in this article's conversation; rebuild index periodically.
    const conv = await db.conversations.where('articleId').equals(articleId).reverse().sortBy('updatedAt').then((r) => r[0]);
    if (!conv?.id) return;
    const msgCount = await db.messages.where('conversationId').equals(conv.id).count();
    if (msgCount > 0 && msgCount % MEMORY_REBUILD_TURN_THRESHOLD === 0) {
      await rebuildMemoryIndex(articleId);
    } else if (!article.memoryIndex) {
      // First memory ever — also seed an index so it shows up in next prompt.
      await rebuildMemoryIndex(articleId);
    }
  } catch (e) {
    console.warn('[paper-ai] memory extraction pipeline failed', e);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  const send = (m: BgToPanel) => {
    try { port.postMessage(m); } catch { /* port closed */ }
  };

  for (const entry of inflight.values()) entry.port = port;

  port.onMessage.addListener(async (msg: PanelToBg) => {
    try {
      if (msg.type === 'EXTRACT') {
        const resp = await sendToTab(msg.tabId, { type: 'EXTRACT_ARTICLE' });
        if (resp.ok && 'article' in resp) {
          send({ type: 'ARTICLE', requestId: msg.requestId, article: resp.article });
        } else {
          send({ type: 'ERROR', requestId: msg.requestId, message: ('error' in resp && resp.error) || 'extract failed' });
        }
        return;
      }
      if (msg.type === 'GET_SELECTION') {
        const resp = await sendToTab(msg.tabId, { type: 'GET_SELECTION' });
        if (resp.ok && 'selection' in resp) {
          send({ type: 'SELECTION', requestId: msg.requestId, text: resp.selection });
        } else {
          send({ type: 'ERROR', requestId: msg.requestId, message: ('error' in resp && resp.error) || 'selection failed' });
        }
        return;
      }
      if (msg.type === 'CHAT') {
        const cfg = await loadConfig();
        const provCfg = cfg.providers[msg.provider];
        if (!provCfg?.apiKey) {
          send({ type: 'ERROR', requestId: msg.requestId, channel: msg.channel, message: '尚未在设置中配置该 Provider 的 API Key' });
          return;
        }
        const ctrl = new AbortController();
        const entry: InflightEntry = {
          ctrl,
          channel: msg.channel,
          articleId: msg.articleId,
          model: msg.model,
          provider: msg.provider,
          port,
        };
        inflight.set(msg.requestId, entry);
        const provider = createProvider(provCfg);
        try {
          const { fullText } = await provider.chat({
            messages: msg.messages,
            model: msg.model,
            signal: ctrl.signal,
            onDelta: (text) => {
              try { entry.port?.postMessage({ type: 'DELTA', requestId: msg.requestId, channel: msg.channel, text }); } catch { /* port gone */ }
            },
          });
          await persistResult(entry, fullText, msg.messages);
          try { entry.port?.postMessage({ type: 'DONE', requestId: msg.requestId, channel: msg.channel, fullText }); } catch { /* port gone */ }
        } catch (e) {
          if ((e as Error).name === 'AbortError' || ctrl.signal.aborted) {
            try { entry.port?.postMessage({ type: 'ABORTED', requestId: msg.requestId, channel: msg.channel }); } catch { /* port gone */ }
          } else {
            const raw = e instanceof Error ? e.message : String(e);
            // Translate common fetch errors into actionable Chinese messages.
            let message = raw;
            if (/Failed to fetch|NetworkError|TypeError: fetch/i.test(raw)) {
              message = `连接 ${msg.provider} 失败：${raw}。可能是网络抖动或 API 域名被拦截，请检查代理；已自动重试 1 次仍失败。`;
            } else if (/HTTP 401|invalid_api_key|Unauthorized/i.test(raw)) {
              message = `API Key 无效或权限不足：${raw}`;
            } else if (/HTTP 429|rate limit|Too Many Requests/i.test(raw)) {
              message = `触发速率限制，请稍后再试：${raw}`;
            } else if (/HTTP 5\d\d/i.test(raw)) {
              message = `Provider 服务端错误：${raw}`;
            }
            try { entry.port?.postMessage({ type: 'ERROR', requestId: msg.requestId, channel: msg.channel, message }); } catch { /* port gone */ }
          }
        } finally {
          inflight.delete(msg.requestId);
        }
        return;
      }
      if (msg.type === 'ABORT') {
        const entry = inflight.get(msg.requestId);
        if (entry) entry.ctrl.abort();
        return;
      }
    } catch (e) {
      const requestId = (msg as { requestId?: string }).requestId ?? '';
      send({ type: 'ERROR', requestId, message: e instanceof Error ? e.message : String(e) });
    }
  });

  port.onDisconnect.addListener(() => {
    // Do not abort inflight LLM calls — see top of file.
    for (const entry of inflight.values()) {
      if (entry.port === port) entry.port = null;
    }
  });
});
