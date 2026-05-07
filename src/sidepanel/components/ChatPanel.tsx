import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { portClient } from '../port';
import { Markdown } from './Markdown';
import { CHAT_SYSTEM, SELECTION_SYSTEM, buildArticleContext, buildSelectionContext } from '../../shared/prompts';
import { appendMessage, articleIdOf, getOrCreateConversation, upsertArticle } from '../../lib/db/repo';
import { db } from '../../lib/db/schema';
import { buildMemoryPromptBlocks } from '../../lib/memory';
import { newRequestId } from '../../lib/messages';

export function ChatPanel() {
  const article = useStore((s) => s.article);
  const tabId = useStore((s) => s.tabId);
  const chat = useStore((s) => s.chat);
  const chatStream = useStore((s) => s.chatStream);
  const provider = useStore((s) => s.provider);
  const model = useStore((s) => s.model);
  const cfg = useStore((s) => s.cfg);
  const errorMsg = useStore((s) => s.errorMsg);
  const [input, setInput] = useState('');
  const [selOverride, setSelOverride] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const grabClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const t = text.trim();
      if (!t) {
        useStore.getState().setError('剪贴板为空。先在 PDF 中选中文字并按 Cmd+C 复制。');
      } else {
        setSelOverride(t);
        useStore.getState().setError(null);
      }
    } catch (e) {
      useStore.getState().setError(`读取剪贴板失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const streaming = chatStream.requestId !== null;
  const hasKey = !!cfg.providers[provider]?.apiKey;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat]);

  const fetchSelection = (): Promise<string> => new Promise((resolve) => {
    if (tabId == null || article?.kind === 'pdf') return resolve('');
    const reqId = newRequestId();
    const off = portClient.bind(reqId, (m) => {
      if (m.type === 'SELECTION' && m.requestId === reqId) { off(); resolve(m.text); }
      else if (m.type === 'ERROR' && m.requestId === reqId) { off(); resolve(''); }
    });
    portClient.send({ type: 'GET_SELECTION', tabId, requestId: reqId });
  });

  const doSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    if (!hasKey) {
      useStore.getState().setError('请先在设置中配置 API Key');
      chrome.runtime.openOptionsPage();
      return;
    }
    const userText = text;
    // Selection priority: clipboard override (used for PDF) > page selection.
    let selText = selOverride ?? '';
    if (!selText) selText = await fetchSelection();

    if (overrideText === undefined) setInput('');
    setSelOverride(null);
    const priorChat = useStore.getState().chat.slice();
    const requestId = newRequestId();
    useStore.getState().startChat(requestId, userText);

    const ctxMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: selText ? SELECTION_SYSTEM : CHAT_SYSTEM },
    ];
    // Inject long-term memory (per-article + cross-article) as an extra system
    // message so it survives prompt-injection sanitization on article body.
    if (article) {
      try {
        const aid = articleIdOf(article);
        const row = await db.articles.get(aid);
        if (row) {
          const memBlock = await buildMemoryPromptBlocks(row);
          if (memBlock) ctxMessages.push({ role: 'system', content: memBlock });
        }
      } catch { /* best-effort */ }
    }
    if (article) {
      const ctx = selText
        ? buildSelectionContext(selText, article, cfg.contextMaxChars ?? 60_000)
        : buildArticleContext(article, cfg.contextMaxChars ?? 60_000);
      ctxMessages.push({ role: 'user', content: ctx });
      ctxMessages.push({ role: 'assistant', content: '已收到论文内容，请提问。' });
    }
    for (const t of priorChat) ctxMessages.push({ role: t.role, content: t.content });
    ctxMessages.push({ role: 'user', content: userText });

    let articleId: string | undefined;
    if (article) {
      try {
        articleId = await upsertArticle(article);
        const convId = await getOrCreateConversation(articleId);
        await appendMessage(convId, { role: 'user', content: userText });
      } catch { /* ignore */ }
    }

    portClient.send({
      type: 'CHAT',
      requestId,
      channel: 'chat',
      provider,
      model,
      articleId,
      messages: ctxMessages,
    });

    portClient.bind(requestId, (m) => {
      if (m.type === 'DONE' && m.requestId === requestId) {
        useStore.getState().finalizeChat(requestId);
      } else if (m.type === 'ERROR' && m.requestId === requestId) {
        useStore.getState().finalizeChat(requestId);
        useStore.getState().setError(m.message);
      } else if (m.type === 'ABORTED' && m.requestId === requestId) {
        useStore.getState().finalizeChat(requestId);
      }
    });
  };

  const send = () => doSend();

  const retry = () => {
    const arr = [...useStore.getState().chat];
    while (arr.length && arr[arr.length - 1].role === 'assistant') arr.pop();
    const lastUser = arr.pop();
    useStore.setState({ chat: arr, errorMsg: null });
    if (lastUser?.role === 'user' && lastUser.content) doSend(lastUser.content);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape' && streaming) {
      e.preventDefault();
      cancel();
    }
  };

  const cancel = () => {
    if (chatStream.requestId) portClient.send({ type: 'ABORT', requestId: chatStream.requestId });
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 space-y-2 text-sm">
        {chat.length === 0 && (
          <div className="text-gray-400 text-xs space-y-1">
            <div>直接输入问题即可。例如：</div>
            <div>· 「总结这篇文章」</div>
            <div>· 「解释方法部分」</div>
            <div>· 在页面上选中一段后输入「解释这段」 — 系统会自动带上你选中的文字</div>
          </div>
        )}
        {chat.map((t, i) => (
          <div key={i} className={t.role === 'user' ? 'text-right' : ''}>
            <div className={
              t.role === 'user'
                ? 'inline-block bg-blue-100 px-2.5 py-1.5 rounded-lg max-w-[90%] text-left'
                : 'inline-block bg-gray-100 px-2.5 py-1.5 rounded-lg max-w-[95%]'
            }>
              {t.role === 'assistant'
                ? (t.content
                    ? <Markdown text={t.content} />
                    : (t.pending ? <span className="text-gray-400 animate-pulse">思考中…</span> : null))
                : <span className="whitespace-pre-wrap">{t.content}</span>}
            </div>
          </div>
        ))}
        {errorMsg && (
          <div className="text-xs text-red-600 flex items-center gap-2">
            <span>{errorMsg}</span>
            {!streaming && chat.length > 0 && (
              <button className="underline hover:no-underline" onClick={retry}>重试</button>
            )}
          </div>
        )}
      </div>
      <div className="border-t p-2">
        {selOverride && (
          <div className="mb-1.5 text-[11px] bg-amber-50 border border-amber-200 rounded px-2 py-1">
            <div className="flex items-start gap-1">
              <span className="text-amber-700 shrink-0">📋 选中：</span>
              <span className="flex-1 text-amber-900 whitespace-pre-wrap line-clamp-3">{selOverride}</span>
              <button
                className="shrink-0 text-amber-700 hover:text-amber-900"
                onClick={() => setSelOverride(null)}
                title="清除"
              >×</button>
            </div>
          </div>
        )}
        <textarea
          rows={3}
          className="w-full border rounded px-2 py-1 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={article
            ? (article.kind === 'pdf'
                ? 'PDF 选中：先在 PDF 里选中文字 Cmd+C 复制 → 点 📋 → 输入问题 → Enter'
                : 'Enter 发送，Shift+Enter 换行，Esc 中止。如需问选中段，先在页面选中再发送。')
            : '正在等待文章…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={!article}
        />
        <div className="flex justify-between items-center mt-1 text-xs gap-3">
          <button
            className="text-gray-600 hover:text-gray-900 disabled:opacity-40"
            title="读取剪贴板里的文字作为选中段（PDF 选中复制后用此键）"
            onClick={() => { void grabClipboard(); }}
            disabled={!article || streaming}
          >📋 粘贴选中</button>
          <div className="flex items-center gap-3">
            {streaming && <button className="text-red-600 hover:underline" onClick={cancel}>中止</button>}
            <button
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded"
              onClick={send}
              disabled={!article || streaming || !input.trim()}
            >发送</button>
          </div>
        </div>
      </div>
    </div>
  );
}
