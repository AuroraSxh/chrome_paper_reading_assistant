import { db, type ArticleRow, type MessageRow, type SummaryRow } from './db/schema';

const HANDLE_KEY = 'obsidian-vault-handle';
const SUBFOLDER_KEY = 'obsidian-subfolder';

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
}

export async function getVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await db.kv.get(HANDLE_KEY);
  return (row?.value as FileSystemDirectoryHandle | undefined) ?? null;
}

export async function setVaultHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  if (handle) await db.kv.put({ key: HANDLE_KEY, value: handle });
  else await db.kv.delete(HANDLE_KEY);
}

export async function getSubfolder(): Promise<string> {
  const row = await db.kv.get(SUBFOLDER_KEY);
  return (row?.value as string | undefined) ?? '';
}

export async function setSubfolder(s: string): Promise<void> {
  await db.kv.put({ key: SUBFOLDER_KEY, value: s.trim() });
}

/** Prompt the user to pick their Obsidian vault folder. Must be a user gesture. */
export async function pickVault(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('当前 Chrome 不支持 File System Access API，请用最新版 Chrome');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await setVaultHandle(handle);
  return handle;
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<void> {
  // @ts-expect-error - queryPermission/requestPermission exist on Chrome
  if ((await handle.queryPermission?.({ mode: 'readwrite' })) === 'granted') return;
  // @ts-expect-error - same
  const result = await handle.requestPermission?.({ mode: 'readwrite' });
  if (result !== 'granted') throw new Error('未授予 vault 文件夹写入权限');
}

async function getOrCreateSubdir(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  const parts = path.split('/').map((p) => p.trim()).filter(Boolean);
  let cur = root;
  for (const p of parts) {
    cur = await cur.getDirectoryHandle(p, { create: true });
  }
  return cur;
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'untitled';
}

function escapeYaml(s: string): string {
  if (/[:#\-\[\]{}&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

export interface ExportPayload {
  article: ArticleRow;
  summary?: SummaryRow;
  messages?: MessageRow[];
}

export function renderMarkdown({ article, summary, messages }: ExportPayload): string {
  const fmLines: string[] = ['---'];
  fmLines.push(`title: ${escapeYaml(article.title)}`);
  if (article.journal) fmLines.push(`journal: ${escapeYaml(article.journal)}`);
  if (article.doi) fmLines.push(`doi: ${escapeYaml(article.doi)}`);
  fmLines.push(`url: ${escapeYaml(article.url)}`);
  if (article.authors?.length) {
    fmLines.push('authors:');
    for (const a of article.authors) fmLines.push(`  - ${escapeYaml(a)}`);
  }
  fmLines.push(`firstRead: ${new Date(article.firstReadAt).toISOString()}`);
  fmLines.push(`lastRead: ${new Date(article.lastReadAt).toISOString()}`);
  if (article.kind) fmLines.push(`kind: ${article.kind}`);
  if (article.favorite) fmLines.push('favorite: true');
  if (article.tags?.length) {
    fmLines.push('tags:');
    for (const t of article.tags) fmLines.push(`  - ${escapeYaml(t)}`);
  }
  fmLines.push('---', '');

  const out: string[] = [...fmLines];
  out.push(`# ${article.title}`, '');

  if (article.abstract) {
    out.push('## Abstract', '', article.abstract, '');
  }
  if (summary?.content) {
    out.push('## AI 总结', '');
    out.push(`> ${summary.provider} / ${summary.model} · ${new Date(summary.createdAt).toLocaleString()}`, '');
    out.push(summary.content, '');
  }

  const userAssistantMessages = (messages ?? []).filter((m) => m.role !== 'system');
  if (userAssistantMessages.length) {
    out.push('## 对话', '');
    for (const m of userAssistantMessages) {
      const ts = new Date(m.createdAt).toLocaleString();
      out.push(`### ${m.role === 'user' ? '🙋 我' : '🤖 助手'} · ${ts}`, '');
      out.push(m.content, '');
    }
  }

  out.push('---', `_exported by Paper Reading Assistant on ${new Date().toLocaleString()}_`, '');
  return out.join('\n');
}

export async function exportToVault(payload: ExportPayload): Promise<{ path: string }> {
  const root = await getVaultHandle();
  if (!root) throw new Error('尚未选择 Obsidian Vault 文件夹，请先到设置中选择');
  await ensurePermission(root);

  const subfolder = await getSubfolder();
  const dir = subfolder ? await getOrCreateSubdir(root, subfolder) : root;

  const md = renderMarkdown(payload);
  const baseName = sanitizeFilename(payload.article.title);
  let name = `${baseName}.md`;
  let n = 0;
  // Disambiguate filename if it exists.
  while (true) {
    try {
      await dir.getFileHandle(name, { create: false });
      n += 1;
      name = `${baseName}-${n}.md`;
    } catch {
      break;
    }
  }

  const file = await dir.getFileHandle(name, { create: true });
  const stream = await file.createWritable();
  await stream.write(md);
  await stream.close();
  return { path: subfolder ? `${subfolder}/${name}` : name };
}
