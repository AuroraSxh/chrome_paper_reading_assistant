import type { Article } from '../messages';
import { db, type ArticleRow, type ConversationRow, type MemoryRow, type MemoryType, type MessageRow, type SummaryRow } from './schema';

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'via', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'igshid', 'ref', 'ref_src',
]);

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    const keep: [string, string][] = [];
    for (const [k, v] of u.searchParams) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.push([k, v]);
    }
    u.search = '';
    for (const [k, v] of keep) u.searchParams.append(k, v);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return raw;
  }
}

export function articleIdOf(a: { doi?: string; url: string; kind?: 'html' | 'pdf' }): string {
  if (a.doi) return `doi:${a.doi.toLowerCase()}`;
  // PDF URLs frequently carry signed query strings (S3/CDN tokens) that
  // change every visit, which would otherwise spawn duplicate history rows.
  // Without a DOI fall back to origin + pathname only.
  if (a.kind === 'pdf') {
    try {
      const u = new URL(a.url);
      return `url:${u.origin}${u.pathname}`;
    } catch {
      return `url:${a.url}`;
    }
  }
  return `url:${normalizeUrl(a.url)}`;
}

export async function upsertArticle(a: Article): Promise<string> {
  const id = articleIdOf(a);
  const now = Date.now();
  const existing = await db.articles.get(id);
  if (existing) {
    await db.articles.update(id, {
      lastReadAt: now,
      title: a.title || existing.title,
      journal: a.journal || existing.journal,
      authors: a.authors || existing.authors,
      abstract: a.abstract || existing.abstract,
      fullText: a.fullText || existing.fullText,
      doi: (a.doi?.toLowerCase()) || existing.doi,
      kind: a.kind || existing.kind,
    });
  } else {
    const row: ArticleRow = {
      id,
      doi: a.doi?.toLowerCase(),
      url: a.url,
      title: a.title,
      journal: a.journal,
      authors: a.authors,
      abstract: a.abstract,
      fullText: a.fullText,
      firstReadAt: now,
      lastReadAt: now,
      tags: [],
      favorite: 0,
      kind: a.kind,
    };
    await db.articles.add(row);
  }
  return id;
}

export async function saveSummary(row: Omit<SummaryRow, 'id'>): Promise<number> {
  return (await db.summaries.add(row)) as number;
}

export async function getLatestSummary(articleId: string): Promise<SummaryRow | undefined> {
  return db.summaries
    .where('articleId').equals(articleId)
    .reverse().sortBy('createdAt').then((r) => r[0]);
}

export async function getOrCreateConversation(articleId: string): Promise<number> {
  const existing = await db.conversations
    .where('articleId').equals(articleId)
    .reverse().sortBy('updatedAt').then((r) => r[0]);
  if (existing?.id) return existing.id;
  return (await db.conversations.add({
    articleId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })) as number;
}

export async function appendMessage(conversationId: number, msg: Omit<MessageRow, 'id' | 'conversationId' | 'createdAt'>): Promise<void> {
  await db.messages.add({
    conversationId,
    role: msg.role,
    content: msg.content,
    createdAt: Date.now(),
  });
  await db.conversations.update(conversationId, { updatedAt: Date.now() });
}

export async function listMessages(conversationId: number): Promise<MessageRow[]> {
  return db.messages.where('conversationId').equals(conversationId).sortBy('createdAt');
}

export interface HistoryQuery {
  q?: string;
  journal?: string;
  tag?: string;
  favoriteOnly?: boolean;
  fromTs?: number;
  toTs?: number;
  kind?: 'html' | 'pdf';
}

export async function listArticles(query: HistoryQuery = {}): Promise<ArticleRow[]> {
  let coll = db.articles.orderBy('lastReadAt').reverse();
  if (query.fromTs || query.toTs) {
    const from = query.fromTs ?? 0;
    const to = query.toTs ?? Number.MAX_SAFE_INTEGER;
    coll = coll.filter((a) => a.lastReadAt >= from && a.lastReadAt <= to);
  }
  let all = await coll.toArray();
  const q = query.q?.trim().toLowerCase();
  if (q) {
    all = all.filter((a) =>
      a.title.toLowerCase().includes(q) ||
      (a.journal?.toLowerCase().includes(q) ?? false) ||
      (a.doi?.toLowerCase().includes(q) ?? false)
    );
  }
  if (query.journal) all = all.filter((a) => a.journal === query.journal);
  if (query.tag) all = all.filter((a) => a.tags.includes(query.tag!));
  if (query.favoriteOnly) all = all.filter((a) => a.favorite === 1);
  if (query.kind) all = all.filter((a) => a.kind === query.kind);
  return all;
}

export async function setFavorite(id: string, fav: boolean): Promise<void> {
  await db.articles.update(id, { favorite: fav ? 1 : 0 });
}

export async function setTags(id: string, tags: string[]): Promise<void> {
  await db.articles.update(id, { tags });
}

export async function deleteArticle(id: string): Promise<void> {
  await db.articles.delete(id);
  const convs = await db.conversations.where('articleId').equals(id).toArray();
  for (const c of convs) {
    if (c.id != null) {
      await db.messages.where('conversationId').equals(c.id).delete();
      await db.conversations.delete(c.id);
    }
  }
  await db.summaries.where('articleId').equals(id).delete();
}

export async function listJournals(): Promise<string[]> {
  const all = await db.articles.toArray();
  const set = new Set<string>();
  for (const a of all) if (a.journal) set.add(a.journal);
  return [...set].sort();
}

export async function listTags(): Promise<string[]> {
  const all = await db.articles.toArray();
  const set = new Set<string>();
  for (const a of all) for (const t of a.tags) set.add(t);
  return [...set].sort();
}

export async function setUserNotes(id: string, notes: string): Promise<void> {
  await db.articles.update(id, { userNotes: notes });
}

export async function setMemoryIndex(articleId: string, memoryIndex: string): Promise<void> {
  await db.articles.update(articleId, { memoryIndex });
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function addMemory(input: Omit<MemoryRow, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  const now = Date.now();
  const id = input.id ?? uuid();
  await db.memories.put({
    id,
    articleId: input.articleId,
    type: input.type,
    title: input.title,
    body: input.body,
    tags: input.tags,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateMemory(id: string, patch: Partial<Omit<MemoryRow, 'id' | 'createdAt'>>): Promise<void> {
  await db.memories.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteMemory(id: string): Promise<void> {
  await db.memories.delete(id);
}

export async function getMemoriesForArticle(articleId: string): Promise<MemoryRow[]> {
  return db.memories.where('articleId').equals(articleId).reverse().sortBy('updatedAt');
}

export async function getMemoriesByType(articleId: string, type: MemoryType): Promise<MemoryRow[]> {
  const all = await getMemoriesForArticle(articleId);
  return all.filter((m) => m.type === type);
}

/** Cross-article memories whose tags overlap with the given tags. Excludes the current article. */
export async function getCrossRefMemories(tags: string[], excludeArticleId?: string, limit = 5): Promise<MemoryRow[]> {
  if (!tags.length) {
    // Fallback: return latest cross-ref entries regardless of tag overlap.
    const arr = await db.memories.where('type').equals('cross-ref').reverse().sortBy('updatedAt');
    return arr.filter((m) => m.articleId !== excludeArticleId).slice(0, limit);
  }
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const all = await db.memories.where('type').equals('cross-ref').reverse().sortBy('updatedAt');
  const matched: MemoryRow[] = [];
  for (const m of all) {
    if (m.articleId === excludeArticleId) continue;
    const mt = (m.tags ?? []).map((t) => t.toLowerCase());
    if (mt.some((t) => tagSet.has(t))) matched.push(m);
    if (matched.length >= limit) break;
  }
  return matched;
}
