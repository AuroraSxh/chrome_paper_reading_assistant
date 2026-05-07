import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ArticleRow } from '../../lib/db/schema';
import { db } from '../../lib/db/schema';
import { deleteArticle, getLatestSummary, getMemoriesForArticle, listMessages, setFavorite, setTags, setUserNotes } from '../../lib/db/repo';
import { exportToVault } from '../../lib/obsidian';
import { Markdown } from './Markdown';

interface Props {
  article: ArticleRow;
  onBack: () => void;
}

export function ArticleDetail({ article, onBack }: Props) {
  const summary = useLiveQuery(() => getLatestSummary(article.id), [article.id]);
  const conv = useLiveQuery(
    () => db.conversations.where('articleId').equals(article.id).reverse().sortBy('updatedAt').then((r) => r[0]),
    [article.id]
  );
  const messages = useLiveQuery(
    () => (conv?.id ? listMessages(conv.id) : Promise.resolve([])),
    [conv?.id]
  );

  const [tagInput, setTagInput] = useState('');

  const addTag = async () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!article.tags.includes(t)) {
      await setTags(article.id, [...article.tags, t]);
    }
    setTagInput('');
  };

  const removeTag = (t: string) => setTags(article.id, article.tags.filter((x) => x !== t));

  const onDelete = async () => {
    if (confirm('删除这条记录及其所有总结/对话？')) {
      await deleteArticle(article.id);
      onBack();
    }
  };

  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const onExport = async () => {
    setExportMsg(null);
    try {
      const memories = await getMemoriesForArticle(article.id);
      const { path, overwritten } = await exportToVault({
        articleId: article.id,
        article,
        summary: summary ?? undefined,
        messages: messages ?? undefined,
        memories,
      });
      setExportMsg(`${overwritten ? '已覆盖' : '已导出'}: ${path}`);
      setTimeout(() => setExportMsg(null), 3000);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const memories = useLiveQuery(() => getMemoriesForArticle(article.id), [article.id]);
  const [notesDraft, setNotesDraft] = useState<string>(article.userNotes ?? '');
  useEffect(() => { setNotesDraft(article.userNotes ?? ''); }, [article.id, article.userNotes]);
  const saveNotes = async () => {
    if (notesDraft === (article.userNotes ?? '')) return;
    await setUserNotes(article.id, notesDraft);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2">
        <button className="text-xs text-gray-600 hover:text-gray-900" onClick={onBack}>← 返回</button>
        <button
          className={`text-base leading-none ${article.favorite ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}
          title={article.favorite ? '取消收藏' : '收藏'}
          onClick={() => setFavorite(article.id, !article.favorite)}
        >★</button>
        <button
          className="text-xs text-emerald-700 hover:text-emerald-900 ml-auto"
          onClick={onExport}
          title="把总结+对话导出为 Markdown 写入 Obsidian Vault"
        >📥 导出 Obsidian</button>
        <a className="text-xs text-blue-600 hover:underline" href={article.url} target="_blank" rel="noreferrer">打开原文</a>
        <button className="text-xs text-red-500 hover:text-red-700" onClick={onDelete}>删除</button>
      </div>
      {exportMsg && <div className="px-3 py-1 text-xs bg-amber-50 border-b text-amber-800">{exportMsg}</div>}
      <div className="flex-1 overflow-auto">
        <div className="px-3 py-3 border-b">
          <h2 className="font-semibold text-sm leading-snug">{article.title}</h2>
          <div className="text-xs text-gray-500 mt-1 space-x-2">
            {article.kind === 'pdf' && <span className="bg-amber-100 text-amber-700 rounded px-1">PDF</span>}
            {article.journal && <span>{article.journal}</span>}
            {article.doi && <span>DOI: {article.doi}</span>}
            <span>{new Date(article.lastReadAt).toLocaleString()}</span>
          </div>
          {article.authors?.length ? (
            <div className="text-xs text-gray-500 mt-0.5">{article.authors.join(', ')}</div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {article.tags.map((t) => (
              <span key={t} className="text-[11px] bg-gray-200 rounded px-1.5 py-0.5">
                {t} <button className="ml-0.5 text-gray-500 hover:text-red-500" onClick={() => removeTag(t)}>×</button>
              </span>
            ))}
            <input
              className="border rounded px-1 py-0.5 text-[11px] w-24"
              placeholder="加标签"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
              onBlur={addTag}
            />
          </div>
        </div>

        {article.memoryIndex && article.memoryIndex.trim() && (
          <section className="px-3 py-2 border-b">
            <h3 className="text-xs font-semibold text-gray-700 mb-1">📚 Memory Index</h3>
            <Markdown text={article.memoryIndex} />
          </section>
        )}

        {memories && memories.length > 0 && (
          <section className="px-3 py-2 border-b">
            <h3 className="text-xs font-semibold text-gray-700 mb-1">🧠 长期记忆 ({memories.length})</h3>
            <div className="space-y-1">
              {memories.map((m) => (
                <details key={m.id} className="text-xs bg-gray-50 rounded px-2 py-1">
                  <summary className="cursor-pointer">
                    <span className="text-[10px] uppercase text-gray-500 mr-1">[{m.type}]</span>
                    {m.title}
                  </summary>
                  <div className="mt-1 text-gray-700 whitespace-pre-wrap">{m.body}</div>
                </details>
              ))}
            </div>
          </section>
        )}

        <section className="px-3 py-2 border-b">
          <h3 className="text-xs font-semibold text-gray-700 mb-1">📝 我的笔记</h3>
          <textarea
            className="w-full border rounded px-2 py-1 text-xs resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="写下任何想让 AI 在下次对话中知道的内容（自动保存）"
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => { void saveNotes(); }}
          />
        </section>

        <section className="px-3 py-2 border-b">
          <h3 className="text-xs font-semibold text-gray-700 mb-1">总结</h3>
          {summary ? (
            <>
              <div className="text-[10px] text-gray-400 mb-1">
                {summary.provider} / {summary.model} · {new Date(summary.createdAt).toLocaleString()}
              </div>
              <Markdown text={summary.content} />
            </>
          ) : (
            <div className="text-xs text-gray-400">暂无总结</div>
          )}
        </section>

        <section className="px-3 py-2">
          <h3 className="text-xs font-semibold text-gray-700 mb-1">对话记录</h3>
          {messages && messages.length > 0 ? (
            <div className="space-y-2">
              {messages.filter((m) => m.role !== 'system').map((m) => (
                <div key={m.id} className={m.role === 'user' ? 'text-right' : ''}>
                  <div className={
                    m.role === 'user'
                      ? 'inline-block bg-blue-100 px-2 py-1 rounded text-left text-sm max-w-[90%]'
                      : 'inline-block bg-gray-100 px-2 py-1 rounded text-sm max-w-[95%]'
                  }>
                    {m.role === 'assistant' ? <Markdown text={m.content} /> : <span>{m.content}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400">暂无对话</div>
          )}
        </section>
      </div>
    </div>
  );
}
