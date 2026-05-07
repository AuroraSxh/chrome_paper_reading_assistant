import { db, type ArticleRow, type MemoryRow, type MessageRow, type SummaryRow } from './db/schema';

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
  // Strip ASCII control chars that produce invalid YAML and could only have
  // landed here via attacker-controlled article text or paste accidents.
  const cleaned = s.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  // Always double-quote — covers `,` `#` leading-`?` reserved words (yes/no/null/true/on)
  // and is uniformly round-trippable. Escape `\` and `"`.
  return `"${cleaned.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Tag-friendly variant of escapeYaml. Obsidian's tag pane historically does
 * not register quoted YAML tag entries, so we only quote when strictly
 * necessary (whitespace or YAML-special chars present).
 */
function escapeYamlTag(s: string): string {
  const cleaned = s.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  // Obsidian tags: must start with a letter or underscore, may contain
  // letters/digits/`_`/`-`/`/` (nested tags). Anything else needs quoting,
  // since unquoted invalid tags are silently dropped from Obsidian's index.
  if (/^[A-Za-z_][A-Za-z0-9_\-\/]*$/.test(cleaned)) return cleaned;
  return `"${cleaned.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface ExportPayload {
  /** Stable article identifier — used as the canonical primary key in frontmatter. */
  articleId: string;
  article: ArticleRow;
  summary?: SummaryRow;
  messages?: MessageRow[];
  memories?: MemoryRow[];
}

export function renderMarkdown({ articleId, article, summary, messages, memories, firstReadOverride }: ExportPayload & { firstReadOverride?: string }): string {
  const fmLines: string[] = ['---'];
  // article_id is the canonical primary key for idempotent re-export. Quote
  // because DOIs contain `/` and `:` which are YAML reserved characters.
  fmLines.push(`article_id: ${escapeYaml(articleId)}`);
  fmLines.push(`title: ${escapeYaml(article.title)}`);
  if (article.journal) fmLines.push(`journal: ${escapeYaml(article.journal)}`);
  if (article.doi) fmLines.push(`doi: ${escapeYaml(article.doi)}`);
  fmLines.push(`url: ${escapeYaml(article.url)}`);
  if (article.authors?.length) {
    fmLines.push('authors:');
    for (const a of article.authors) fmLines.push(`  - ${escapeYaml(a)}`);
  }
  // Preserve firstRead from the existing vault file if present — that's the
  // true "first time exported", which we should never clobber on re-export.
  const firstReadIso = firstReadOverride ?? new Date(article.firstReadAt).toISOString();
  fmLines.push(`firstRead: ${firstReadIso}`);
  fmLines.push(`lastRead: ${new Date(article.lastReadAt).toISOString()}`);
  if (article.kind) fmLines.push(`kind: ${article.kind}`);
  if (article.favorite) fmLines.push('favorite: true');
  if (article.tags?.length) {
    fmLines.push('tags:');
    for (const t of article.tags) fmLines.push(`  - ${escapeYamlTag(t)}`);
  }
  fmLines.push('---', '');

  const out: string[] = [...fmLines];
  out.push(`# ${article.title}`, '');

  if (article.abstract) {
    out.push('## Abstract', '', article.abstract, '');
  }
  if (article.memoryIndex && article.memoryIndex.trim()) {
    out.push('## Memory Index', '', article.memoryIndex.trim(), '');
  }
  if (memories && memories.length) {
    out.push('## Memories', '');
    const grouped = new Map<string, MemoryRow[]>();
    for (const m of memories) {
      const arr = grouped.get(m.type) ?? [];
      arr.push(m);
      grouped.set(m.type, arr);
    }
    const order = ['finding', 'interpretation', 'question', 'cross-ref', 'user-note'] as const;
    for (const t of order) {
      const arr = grouped.get(t);
      if (!arr?.length) continue;
      out.push(`### ${t}`, '');
      for (const m of arr) {
        out.push(`- **${m.title}**`, '');
        out.push(m.body.split('\n').map((l) => `  ${l}`).join('\n'), '');
      }
    }
  }
  if (article.userNotes && article.userNotes.trim()) {
    out.push('## My Notes', '', article.userNotes.trim(), '');
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

const ARTICLE_ID_RE = /^article_id:\s*(?:"([^"]*)"|'([^']*)'|(\S.*?))\s*$/m;
const FIRST_READ_RE = /^firstRead:\s*(\S.*?)\s*$/m;

interface ExistingFileMatch {
  name: string;
  handle: FileSystemFileHandle;
  firstReadIso?: string;
}

/** Read the YAML frontmatter block of an .md file and return its raw text. */
async function readFrontmatter(fileHandle: FileSystemFileHandle): Promise<string | null> {
  const file = await fileHandle.getFile();
  // Try sizes 16KB → 64KB → whole file so unusually large frontmatter (long
  // memory index + many memories) still gets matched; very few files will
  // exceed 16KB so the second/third reads are rarely paid.
  const sizes = [16_384, 65_536, file.size];
  for (const limit of sizes) {
    const head = await file.slice(0, Math.min(limit, file.size)).text();
    if (!head.startsWith('---')) return null;
    const after = head.slice(3);
    const closeIdx = after.search(/^\s*---\s*$/m);
    if (closeIdx >= 0) return after.slice(0, closeIdx);
    if (limit >= file.size) return null;
  }
  return null;
}

function articleIdFromFrontmatter(fm: string): string | null {
  const m = fm.match(ARTICLE_ID_RE);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

function firstReadFromFrontmatter(fm: string): string | undefined {
  const m = fm.match(FIRST_READ_RE);
  if (!m) return undefined;
  // Strip surrounding quotes if the prior file double- or single-quoted the value.
  return m[1].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

/** Find an existing .md file in `dir` whose frontmatter `article_id` equals the given id. */
async function findExistingByArticleId(
  dir: FileSystemDirectoryHandle,
  articleId: string,
): Promise<ExistingFileMatch | null> {
  const entries = (dir as unknown as { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries?.bind(dir);
  if (!entries) return null;
  for await (const entry of entries()) {
    const [name, handle] = entry;
    if (handle.kind !== 'file') continue;
    if (!name.toLowerCase().endsWith('.md')) continue;
    try {
      const fileHandle = handle as FileSystemFileHandle;
      const fm = await readFrontmatter(fileHandle);
      if (!fm) continue;
      if (articleIdFromFrontmatter(fm) === articleId) {
        return { name, handle: fileHandle, firstReadIso: firstReadFromFrontmatter(fm) };
      }
    } catch {
      // ignore unreadable files
    }
  }
  return null;
}

function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 6);
}

export async function exportToVault(payload: ExportPayload): Promise<{ path: string; overwritten: boolean }> {
  const root = await getVaultHandle();
  if (!root) throw new Error('尚未选择 Obsidian Vault 文件夹，请先到设置中选择');
  await ensurePermission(root);

  const subfolder = await getSubfolder();
  const dir = subfolder ? await getOrCreateSubdir(root, subfolder) : root;

  // 1) Try to find an existing file by frontmatter article_id — overwrite it.
  const existing = await findExistingByArticleId(dir, payload.articleId);
  let name: string;
  let fileHandle: FileSystemFileHandle;
  let overwritten = false;
  let firstReadOverride: string | undefined;
  if (existing) {
    name = existing.name;
    fileHandle = existing.handle;
    overwritten = true;
    firstReadOverride = existing.firstReadIso;
  } else {
    // 2) No existing file — create one. If filename collides with another
    //    article (rare), append a short hash of articleId so the new file
    //    doesn't overwrite an unrelated note.
    const baseName = sanitizeFilename(payload.article.title);
    name = `${baseName}.md`;
    try {
      await dir.getFileHandle(name, { create: false });
      // Collision with a different article — disambiguate via stable hash.
      name = `${baseName} (${shortHash(payload.articleId)}).md`;
    } catch {
      // free, use as-is.
    }
    fileHandle = await dir.getFileHandle(name, { create: true });
  }

  const md = renderMarkdown({ ...payload, firstReadOverride });
  const stream = await fileHandle.createWritable();
  await stream.write(md);
  await stream.close();
  return { path: subfolder ? `${subfolder}/${name}` : name, overwritten };
}
