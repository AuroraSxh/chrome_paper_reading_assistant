import { db } from './db/schema';

export interface BackupBundle {
  version: 1;
  exportedAt: string;
  schema: 4;
  articles: unknown[];
  summaries: unknown[];
  conversations: unknown[];
  messages: unknown[];
  memories: unknown[];
  /** kv excludes the Obsidian vault handle (FileSystemDirectoryHandle is not serializable). */
  kv: { key: string; value: unknown }[];
}

const NON_SERIALIZABLE_KV_KEYS = new Set(['obsidian-vault-handle']);

export async function exportAllAsJson(): Promise<string> {
  const [articles, summaries, conversations, messages, memories, kvAll] = await Promise.all([
    db.articles.toArray(),
    db.summaries.toArray(),
    db.conversations.toArray(),
    db.messages.toArray(),
    db.memories.toArray(),
    db.kv.toArray(),
  ]);
  const kv = kvAll.filter((r) => !NON_SERIALIZABLE_KV_KEYS.has(r.key));
  const bundle: BackupBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    schema: 4,
    articles,
    summaries,
    conversations,
    messages,
    memories,
    kv,
  };
  return JSON.stringify(bundle, null, 2);
}

export interface ImportResult {
  articles: number;
  summaries: number;
  conversations: number;
  messages: number;
  memories: number;
  kv: number;
}

export type ImportMode = 'merge' | 'replace';

export async function importFromJson(raw: string, mode: ImportMode = 'merge'): Promise<ImportResult> {
  const parsed = JSON.parse(raw) as Partial<BackupBundle>;
  if (!parsed || typeof parsed !== 'object') throw new Error('备份文件格式无效');
  if (parsed.version !== 1) throw new Error(`不支持的备份版本: ${parsed.version}`);

  await db.transaction('rw', [db.articles, db.summaries, db.conversations, db.messages, db.memories, db.kv], async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.articles.clear(),
        db.summaries.clear(),
        db.conversations.clear(),
        db.messages.clear(),
        db.memories.clear(),
      ]);
    }
    if (parsed.articles?.length) await db.articles.bulkPut(parsed.articles as Parameters<typeof db.articles.bulkPut>[0]);
    if (parsed.summaries?.length) await db.summaries.bulkPut(parsed.summaries as Parameters<typeof db.summaries.bulkPut>[0]);
    if (parsed.conversations?.length) await db.conversations.bulkPut(parsed.conversations as Parameters<typeof db.conversations.bulkPut>[0]);
    if (parsed.messages?.length) await db.messages.bulkPut(parsed.messages as Parameters<typeof db.messages.bulkPut>[0]);
    if (parsed.memories?.length) await db.memories.bulkPut(parsed.memories as Parameters<typeof db.memories.bulkPut>[0]);
    if (parsed.kv?.length) {
      for (const row of parsed.kv) {
        if (NON_SERIALIZABLE_KV_KEYS.has((row as { key: string }).key)) continue;
        await db.kv.put(row as { key: string; value: unknown });
      }
    }
  });

  return {
    articles: parsed.articles?.length ?? 0,
    summaries: parsed.summaries?.length ?? 0,
    conversations: parsed.conversations?.length ?? 0,
    messages: parsed.messages?.length ?? 0,
    memories: parsed.memories?.length ?? 0,
    kv: parsed.kv?.length ?? 0,
  };
}

export function downloadBackup(json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `paper-ai-backup-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickAndReadJson(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('未选择文件')); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    };
    input.click();
  });
}
