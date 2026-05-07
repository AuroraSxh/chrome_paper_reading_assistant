import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useStore } from '../store';
import { db } from '../../lib/db/schema';
import { articleIdOf, deleteMemory, getMemoriesForArticle, setUserNotes } from '../../lib/db/repo';
import { Markdown } from './Markdown';

/**
 * Collapsible panel shown above ChatPanel on the current-article tab.
 * Surfaces the long-term memory + user notes so the user can see and edit
 * what the AI is keeping across sessions.
 */
export function CurrentArticleMemory() {
  const article = useStore((s) => s.article);
  const [open, setOpen] = useState(false);
  const id = article ? articleIdOf(article) : null;

  const row = useLiveQuery(() => (id ? db.articles.get(id) : undefined), [id]);
  const memories = useLiveQuery(() => (id ? getMemoriesForArticle(id) : Promise.resolve([])), [id]);

  const [notesDraft, setNotesDraft] = useState<string>('');
  useEffect(() => { setNotesDraft(row?.userNotes ?? ''); }, [id, row?.userNotes]);

  if (!article || !id) return null;

  const saveNotes = async () => {
    if (notesDraft === (row?.userNotes ?? '')) return;
    // Ensure the article row exists before writing notes.
    if (!row) return;
    await setUserNotes(id, notesDraft);
  };

  const memCount = memories?.length ?? 0;
  const hasIndex = !!row?.memoryIndex?.trim();
  const hasNotes = !!(row?.userNotes && row.userNotes.trim());

  return (
    <div className="border-b text-xs bg-white">
      <button
        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="font-medium text-gray-700">🧠 记忆 & 笔记</span>
        <span className="text-[10px] text-gray-500">
          {memCount} 条记忆 · {hasIndex ? '有索引' : '暂无索引'} · {hasNotes ? '有笔记' : '无笔记'}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2 space-y-2">
          {hasIndex && (
            <div>
              <div className="text-[10px] uppercase text-gray-500 mb-1">Memory Index</div>
              <div className="bg-gray-50 rounded px-2 py-1">
                <Markdown text={row!.memoryIndex!} />
              </div>
            </div>
          )}

          {memCount > 0 && (
            <div>
              <div className="text-[10px] uppercase text-gray-500 mb-1">长期记忆</div>
              <div className="space-y-1 max-h-48 overflow-auto">
                {memories!.map((m) => (
                  <details key={m.id} className="bg-gray-50 rounded px-2 py-1">
                    <summary className="cursor-pointer flex items-center gap-1">
                      <span className="text-[10px] uppercase text-gray-500">[{m.type}]</span>
                      <span className="flex-1">{m.title}</span>
                      <button
                        className="text-[10px] text-gray-400 hover:text-red-500"
                        onClick={(e) => { e.preventDefault(); void deleteMemory(m.id); }}
                        title="删除这条记忆"
                      >✕</button>
                    </summary>
                    <div className="mt-1 text-gray-700 whitespace-pre-wrap">{m.body}</div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {memCount === 0 && !hasIndex && (
            <div className="text-[11px] text-gray-400 italic">
              记忆会在你与 AI 对话几轮后自动产生。每 6 轮重建一次索引。
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase text-gray-500 mb-1">📝 我的笔记（自动保存，会注入下一轮 prompt）</div>
            <textarea
              className="w-full border rounded px-2 py-1 text-xs resize-y min-h-[50px] focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="例如：关注实验设计是否有 batch effect / 这个方法能否用到我自己的数据"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => { void saveNotes(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
