import React, { useEffect, useState } from 'react';
import { ProviderBar } from './components/ProviderBar';
import { ArticleHeader } from './components/ArticleHeader';
import { CurrentArticleMemory } from './components/CurrentArticleMemory';
import { ChatPanel } from './components/ChatPanel';
import { HistoryView } from './components/HistoryView';
import { ArticleDetail } from './components/ArticleDetail';
import { useStore, type ChatTurn } from './store';
import { portClient } from './port';
import type { ArticleRow } from '../lib/db/schema';
import { db } from '../lib/db/schema';
import { triggerExtract } from './extract';
import { articleIdOf, getLatestSummary, listMessages, upsertArticle } from '../lib/db/repo';

type Tab = 'current' | 'history';

export function App() {
  const [tab, setTab] = useState<Tab>('current');
  const [detail, setDetail] = useState<ArticleRow | null>(null);

  const article = useStore((s) => s.article);
  const setTabId = useStore((s) => s.setTabId);
  const loadInitialConfig = useStore((s) => s.loadInitialConfig);

  useEffect(() => {
    loadInitialConfig();
    portClient.connect();

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const t = tabs[0];
      if (t?.id != null) {
        setTabId(t.id);
        void triggerExtract(t.id, t.url);
      }
    });

    const onUpdated = (tabId: number, change: chrome.tabs.TabChangeInfo) => {
      const myTab = useStore.getState().tabId;
      if (tabId !== myTab) return;
      if (change.url) {
        useStore.getState().setArticle(null);
        useStore.getState().resetForArticle();
        void triggerExtract(tabId, change.url);
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);

    const off = portClient.on((m) => {
      const s = useStore.getState();
      if (m.type === 'ARTICLE') {
        if (m.requestId === s.extractRequestId) {
          s.setArticle(m.article);
          s.setExtractRequestId(null);
        }
      } else if (m.type === 'DELTA') {
        if (m.channel === 'chat') s.appendChatDelta(m.requestId, m.text);
        // 'summary' channel is no longer used by the UI; ignore.
      } else if (m.type === 'ERROR' && m.requestId === s.extractRequestId) {
        s.setLoadingArticle(false);
        s.setExtractRequestId(null);
        if (!/未注入扩展脚本|Receiving end does not exist/i.test(m.message)) {
          s.setError(m.message);
        }
      } else if (m.type === 'ABORTED' && m.requestId === s.extractRequestId) {
        s.setLoadingArticle(false);
        s.setExtractRequestId(null);
      }
    });

    return () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      off();
    };
  }, [loadInitialConfig, setTabId]);

  // Restore previous summary + chat history from IndexedDB whenever a new
  // article becomes the active one. The legacy summary (if any) is rendered
  // as the first assistant message so the user sees continuity.
  useEffect(() => {
    if (!article) return;
    let cancelled = false;
    (async () => {
      // Eagerly create/refresh the article row so that:
      // 1) memory injection on the very first chat turn can find it,
      // 2) user notes / tags can be saved before any chat happens,
      // 3) all downstream code can rely on `db.articles.get(id)` returning a row.
      await upsertArticle(article);
      if (cancelled) return;
      const id = articleIdOf(article);
      const [sum, conv] = await Promise.all([
        getLatestSummary(id),
        db.conversations.where('articleId').equals(id).reverse().sortBy('updatedAt').then((r) => r[0]),
      ]);
      if (cancelled) return;
      const turns: ChatTurn[] = [];
      if (sum) {
        turns.push({
          role: 'assistant',
          content: `> 历史总结 · ${new Date(sum.createdAt).toLocaleDateString()} · ${sum.provider}/${sum.model}\n\n${sum.content}`,
        });
      }
      if (conv?.id) {
        const msgs = await listMessages(conv.id);
        if (cancelled) return;
        for (const m of msgs.filter((mm) => mm.role !== 'system')) {
          turns.push({ role: m.role as 'user' | 'assistant', content: m.content });
        }
      }
      const s = useStore.getState();
      if (turns.length && s.chat.length === 0 && !s.chatStream.requestId) {
        useStore.setState({ chat: turns });
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [article?.url, article?.doi]);

  return (
    <div className="flex flex-col h-screen">
      <ProviderBar />
      <div className="flex border-b text-xs">
        <button
          className={`flex-1 py-1.5 ${tab === 'current' ? 'border-b-2 border-blue-600 font-medium' : 'text-gray-500'}`}
          onClick={() => { setTab('current'); setDetail(null); }}
        >当前文章</button>
        <button
          className={`flex-1 py-1.5 ${tab === 'history' ? 'border-b-2 border-blue-600 font-medium' : 'text-gray-500'}`}
          onClick={() => setTab('history')}
        >阅读历史</button>
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'current' ? (
          <div className="flex flex-col h-full">
            <ArticleHeader />
            {/* Cap memory panel so a long memory list / notes textarea can't push
                the chat input out of the viewport. */}
            <div className="shrink-0 max-h-[40vh] overflow-auto">
              <CurrentArticleMemory />
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel />
            </div>
          </div>
        ) : detail ? (
          <ArticleDetail article={detail} onBack={() => setDetail(null)} />
        ) : (
          <HistoryView onOpen={(a) => setDetail(a)} />
        )}
      </div>
    </div>
  );
}
