import type { ChatMessage } from './messages';
import { loadConfig } from './config';
import { createProvider } from './llm';
import {
  addMemory,
  getCrossRefMemories,
  getMemoriesForArticle,
  setMemoryIndex,
  updateMemory,
} from './db/repo';
import { db, type ArticleRow, type MemoryRow, type MemoryType } from './db/schema';

const MEMORY_TYPES: MemoryType[] = ['finding', 'interpretation', 'question', 'user-note', 'cross-ref'];

const EXTRACT_SYSTEM = `你是一个长期记忆抽取器。给定一篇论文的元信息、之前的记忆、最近一轮对话，判断本轮是否产生了"值得长期记忆"的新信息。

只输出 JSON 数组，每条形如：
{"type":"finding|interpretation|question|user-note|cross-ref","title":"<=80字摘要","body":"<=300字正文，带 Why 与应用场景","tags":["..."]}

类型说明：
- finding: 论文中的客观事实/数据（方法、样本、关键结果）
- interpretation: AI 对论文的批判性观点或推断
- question: 悬而未决的问题、follow-up
- user-note: 用户明确表达的偏好/关注点（基于他的提问）
- cross-ref: 与其他论文/概念的关联（含 doi 或主题词）

如果本轮没有新信息，输出 []。不要输出已存在的相似记忆（avoid_titles 字段会列出现有 title）。`;

const INDEX_SYSTEM = `你是一个论文记忆索引生成器。把若干条 memory 压缩为一份简短 markdown 列表（≤12 条），每行格式：
- [<type>] <title>

按重要性排序（finding 与 question 在前），保留对未来阅读最有用的条目。`;

interface ExtractedMemory {
  type: MemoryType;
  title: string;
  body: string;
  tags?: string[];
}

function safeParseJsonArray(raw: string): ExtractedMemory[] {
  // Strip code fences if model wrapped output.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  // Find first [ and last ] for tolerance to prelude/coda text.
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end < start) return [];
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is ExtractedMemory =>
        x && typeof x === 'object' &&
        MEMORY_TYPES.includes(x.type) &&
        typeof x.title === 'string' && x.title.length > 0 &&
        typeof x.body === 'string' && x.body.length > 0
      )
      .map((x) => ({
        type: x.type,
        title: x.title.slice(0, 120),
        body: x.body.slice(0, 1200),
        tags: Array.isArray(x.tags) ? x.tags.filter((t) => typeof t === 'string').slice(0, 6) : undefined,
      }));
  } catch {
    return [];
  }
}

async function callLLM(messages: ChatMessage[], abortMs = 30_000): Promise<string> {
  const cfg = await loadConfig();
  const provCfg = cfg.providers[cfg.activeProvider];
  if (!provCfg?.apiKey) throw new Error('no-api-key');
  const provider = createProvider(provCfg);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), abortMs);
  try {
    const { fullText } = await provider.chat({
      messages,
      model: provCfg.defaultModel,
      signal: ctrl.signal,
      onDelta: () => {},
    });
    return fullText;
  } finally {
    clearTimeout(timer);
  }
}

/** Cosine-free fuzzy dedup: two memories collide if their lowercased titles share ≥70% of tokens. */
function isDuplicateTitle(a: string, b: string): boolean {
  const norm = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length > 1));
  const sa = norm(a);
  const sb = norm(b);
  if (!sa.size || !sb.size) return false;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const denom = Math.min(sa.size, sb.size);
  return inter / denom >= 0.7;
}

/**
 * After a chat turn, ask the LLM whether the latest exchange produced any new
 * long-term memory and persist non-duplicate entries.
 */
export async function extractMemoriesFromTurn(input: {
  article: ArticleRow;
  recentMessages: ChatMessage[];
}): Promise<MemoryRow[]> {
  const existing = await getMemoriesForArticle(input.article.id);
  const avoidTitles = existing.map((m) => m.title).slice(0, 30);

  const prompt: ChatMessage[] = [
    { role: 'system', content: EXTRACT_SYSTEM },
    {
      role: 'user',
      content: [
        `# Article`,
        `title: ${input.article.title}`,
        input.article.doi ? `doi: ${input.article.doi}` : '',
        input.article.journal ? `journal: ${input.article.journal}` : '',
        '',
        `# avoid_titles`,
        JSON.stringify(avoidTitles),
        '',
        `# recent_conversation`,
        ...input.recentMessages.slice(-6).map((m) => `[${m.role}] ${m.content}`),
        '',
        '只输出 JSON 数组。',
      ].filter(Boolean).join('\n'),
    },
  ];

  let raw: string;
  try {
    raw = await callLLM(prompt);
  } catch (e) {
    console.warn('[paper-ai] memory extraction LLM failed', e);
    return [];
  }
  const candidates = safeParseJsonArray(raw);
  const saved: MemoryRow[] = [];
  for (const c of candidates) {
    const dup = existing.find((m) => m.type === c.type && isDuplicateTitle(m.title, c.title));
    if (dup) {
      // Update body if non-trivial new content.
      if (c.body && c.body !== dup.body) {
        await updateMemory(dup.id, { body: c.body, tags: c.tags ?? dup.tags });
      }
      continue;
    }
    const id = await addMemory({
      articleId: c.type === 'cross-ref' ? input.article.id : input.article.id,
      type: c.type,
      title: c.title,
      body: c.body,
      tags: c.tags,
      source: 'ai',
    });
    const row = await db.memories.get(id);
    if (row) saved.push(row);
  }
  return saved;
}

export async function rebuildMemoryIndex(articleId: string): Promise<string> {
  const items = await getMemoriesForArticle(articleId);
  if (items.length === 0) {
    await setMemoryIndex(articleId, '');
    return '';
  }
  // Heuristic shortcut for tiny memory sets — skip LLM round-trip.
  if (items.length <= 4) {
    const md = items.map((m) => `- [${m.type}] ${m.title}`).join('\n');
    await setMemoryIndex(articleId, md);
    return md;
  }

  const prompt: ChatMessage[] = [
    { role: 'system', content: INDEX_SYSTEM },
    {
      role: 'user',
      content: items.map((m) => `[${m.type}] ${m.title} :: ${m.body.slice(0, 200)}`).join('\n\n'),
    },
  ];
  let raw: string;
  try {
    raw = await callLLM(prompt);
  } catch {
    // Fallback: dump titles directly.
    raw = items.map((m) => `- [${m.type}] ${m.title}`).join('\n');
  }
  // Keep only lines starting with "- ".
  const md = raw.split('\n').filter((l) => /^\s*-\s+/.test(l)).slice(0, 12).join('\n').trim();
  const final = md || items.map((m) => `- [${m.type}] ${m.title}`).join('\n');
  await setMemoryIndex(articleId, final);
  return final;
}

/**
 * Build the article-memory + cross-ref blocks to inject into the system prompt
 * when starting a chat for this article.
 */
export async function buildMemoryPromptBlocks(article: ArticleRow): Promise<string> {
  const blocks: string[] = [];
  if (article.memoryIndex && article.memoryIndex.trim()) {
    blocks.push(`<article-memory>\n${article.memoryIndex.trim()}\n</article-memory>`);
  }
  // Cross-ref memories from other articles whose tags overlap with this article's tags or memory tags.
  const memories = await getMemoriesForArticle(article.id);
  const tagPool = new Set<string>();
  for (const t of article.tags ?? []) tagPool.add(t);
  for (const m of memories) for (const t of m.tags ?? []) tagPool.add(t);
  const crossRefs = await getCrossRefMemories([...tagPool], article.id, 5);
  if (crossRefs.length) {
    const lines = crossRefs.map((m) => `- ${m.title} :: ${m.body.slice(0, 200)}`);
    blocks.push(`<related-memory>\n${lines.join('\n')}\n</related-memory>`);
  }
  if (article.userNotes && article.userNotes.trim()) {
    blocks.push(`<user-notes>\n${article.userNotes.trim()}\n</user-notes>`);
  }
  return blocks.join('\n\n');
}

export const MEMORY_REBUILD_TURN_THRESHOLD = 6;
