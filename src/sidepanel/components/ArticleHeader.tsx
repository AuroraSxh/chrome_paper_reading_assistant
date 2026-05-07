import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { triggerExtract } from '../extract';
import { articleIdOf, getOrCreateConversation, listMessages, setFavorite, upsertArticle } from '../../lib/db/repo';
import { db } from '../../lib/db/schema';
import { exportToVault } from '../../lib/obsidian';
import { useLiveQuery } from 'dexie-react-hooks';

export function ArticleHeader() {
  const article = useStore((s) => s.article);
  const tabId = useStore((s) => s.tabId);
  const loadingArticle = useStore((s) => s.loadingArticle);

  const articleRow = useLiveQuery(
    () => (article ? db.articles.get(articleIdOf(article)) : undefined),
    [article?.url, article?.doi]
  );
  const favorite = !!articleRow?.favorite;

  const [exportMsg, setExportMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!exportMsg) return;
    const t = setTimeout(() => setExportMsg(null), 3000);
    return () => clearTimeout(t);
  }, [exportMsg]);

  if (loadingArticle) {
    return <div className="px-3 py-2 text-xs text-gray-500 border-b">正在抽取页面正文…</div>;
  }
  if (!article) {
    return (
      <div className="px-3 py-2 border-b text-xs space-y-1">
        <p className="text-gray-600">未识别到当前页面文章。请在期刊文章页或 PDF 阅读页打开侧边栏。</p>
        <p className="text-gray-400">首次安装/更新扩展后，已经打开的页面需要按 F5 刷新一次。</p>
        <button
          className="text-blue-600 hover:underline"
          onClick={() => tabId != null && triggerExtract(tabId)}
        >重试抽取</button>
      </div>
    );
  }

  const toggleFav = async () => {
    const id = await upsertArticle(article);
    await setFavorite(id, !favorite);
  };

  const onRefetch = () => {
    if (tabId == null) return;
    void triggerExtract(tabId);
  };

  const onExport = async () => {
    setExportMsg(null);
    try {
      const id = await upsertArticle(article);
      const row = await db.articles.get(id);
      if (!row) throw new Error('文章未找到');
      const summaryRow = await db.summaries
        .where('articleId').equals(id)
        .reverse().sortBy('createdAt').then((r) => r[0]);
      const conv = await db.conversations
        .where('articleId').equals(id)
        .reverse().sortBy('updatedAt').then((r) => r[0]);
      const messages = conv?.id ? await listMessages(conv.id) : [];
      const { path } = await exportToVault({ article: row, summary: summaryRow, messages });
      setExportMsg(`已导出: ${path}`);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="px-3 py-2 border-b bg-white">
      <h2 className="font-semibold text-sm leading-snug line-clamp-2">{article.title}</h2>
      <div className="text-xs text-gray-500 mt-0.5 space-x-2">
        {article.kind === 'pdf' && <span className="bg-amber-100 text-amber-700 rounded px-1">PDF</span>}
        {article.journal && <span>{article.journal}</span>}
        {article.doi && <span>DOI: {article.doi}</span>}
      </div>
      {article.authors?.length ? (
        <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{article.authors.join(', ')}</div>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <button
          className={`text-base leading-none ${favorite ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}
          title={favorite ? '取消收藏' : '收藏'}
          onClick={() => { void toggleFav(); }}
        >★</button>
        <button
          className="text-gray-600 hover:text-gray-900"
          onClick={onRefetch}
        >重新抽取</button>
        <button
          className="text-emerald-700 hover:text-emerald-900"
          title="把对话+总结导出为 Markdown 写入 Obsidian Vault"
          onClick={() => { void onExport(); }}
        >📥 Obsidian</button>
        <span className="text-gray-400 ml-auto">{article.fullText.length.toLocaleString()} 字符</span>
      </div>
      {exportMsg && (
        <div className="mt-1 text-[11px] text-amber-800 bg-amber-50 rounded px-1.5 py-0.5">{exportMsg}</div>
      )}
    </div>
  );
}
