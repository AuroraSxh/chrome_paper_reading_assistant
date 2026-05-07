import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db/schema';
import { listArticles, listJournals, listTags, setFavorite } from '../../lib/db/repo';
import type { ArticleRow } from '../../lib/db/schema';

interface Props {
  onOpen: (a: ArticleRow) => void;
}

export function HistoryView({ onOpen }: Props) {
  const [q, setQ] = useState('');
  const [journal, setJournal] = useState('');
  const [tag, setTag] = useState('');
  const [favOnly, setFavOnly] = useState(false);

  const articles = useLiveQuery(
    () => listArticles({ q, journal: journal || undefined, tag: tag || undefined, favoriteOnly: favOnly }),
    [q, journal, tag, favOnly]
  );
  const journals = useLiveQuery(() => listJournals(), []);
  const tags = useLiveQuery(() => listTags(), []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b space-y-1.5 bg-gray-50">
        <input
          className="w-full border rounded px-2 py-1 text-xs"
          placeholder="搜索标题 / 期刊 / DOI"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-1.5">
          <select className="border rounded px-1 py-0.5 text-xs flex-1 bg-white" value={journal} onChange={(e) => setJournal(e.target.value)}>
            <option value="">全部期刊</option>
            {journals?.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          <select className="border rounded px-1 py-0.5 text-xs flex-1 bg-white" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">全部标签</option>
            {tags?.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} />
            收藏
          </label>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {articles?.length === 0 && <div className="p-4 text-xs text-gray-400">还没有阅读记录。打开一篇文章点"总结"或"提问"即可建档。</div>}
        {articles?.map((a) => (
          <div
            key={a.id}
            className="px-3 py-2 border-b hover:bg-blue-50 cursor-pointer"
            onClick={() => onOpen(a)}
          >
            <div className="flex items-start gap-2">
              <button
                className={`text-base leading-none ${a.favorite ? 'text-yellow-500' : 'text-gray-300'}`}
                onClick={(e) => { e.stopPropagation(); setFavorite(a.id, !a.favorite); }}
                title="收藏"
              >★</button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-snug line-clamp-2 flex items-start gap-1">
                  {a.kind === 'pdf' && <span className="shrink-0 text-[9px] bg-amber-100 text-amber-700 rounded px-1 leading-4 mt-0.5">PDF</span>}
                  <span>{a.title}</span>
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {a.journal && <span>{a.journal} · </span>}
                  <span>{new Date(a.lastReadAt).toLocaleDateString()}</span>
                </div>
                {a.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.tags.map((t) => (
                      <span key={t} className="text-[10px] bg-gray-200 rounded px-1.5 py-0.5">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
