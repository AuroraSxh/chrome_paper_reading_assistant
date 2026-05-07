import Dexie, { type Table } from 'dexie';

export interface ArticleRow {
  id: string;
  doi?: string;
  url: string;
  title: string;
  journal?: string;
  authors?: string[];
  abstract?: string;
  fullText?: string;
  firstReadAt: number;
  lastReadAt: number;
  tags: string[];
  favorite: 0 | 1;
  kind?: 'html' | 'pdf';
  /** Lightweight markdown index of memories for this article, always injected into prompt. */
  memoryIndex?: string;
  /** Free-form user notes (markdown). */
  userNotes?: string;
}

export interface SummaryRow {
  id?: number;
  articleId: string;
  model: string;
  provider: string;
  content: string;
  createdAt: number;
}

export interface ConversationRow {
  id?: number;
  articleId: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
}

export interface MessageRow {
  id?: number;
  conversationId: number;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface KvRow {
  key: string;
  value: unknown;
}

export type MemoryType = 'finding' | 'interpretation' | 'question' | 'user-note' | 'cross-ref';

export interface MemoryRow {
  id: string;
  /** undefined = global / cross-article memory. */
  articleId?: string;
  type: MemoryType;
  title: string;
  body: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  source: 'ai' | 'user';
}

export class PaperDB extends Dexie {
  articles!: Table<ArticleRow, string>;
  summaries!: Table<SummaryRow, number>;
  conversations!: Table<ConversationRow, number>;
  messages!: Table<MessageRow, number>;
  kv!: Table<KvRow, string>;
  memories!: Table<MemoryRow, string>;

  constructor() {
    super('paper-ai');
    this.version(1).stores({
      articles: 'id, doi, url, title, journal, firstReadAt, lastReadAt, *tags, favorite',
      summaries: '++id, articleId, createdAt',
      conversations: '++id, articleId, updatedAt',
      messages: '++id, conversationId, createdAt',
    });
    this.version(2).stores({
      articles: 'id, doi, url, title, journal, firstReadAt, lastReadAt, *tags, favorite, kind',
    });
    this.version(3).stores({
      kv: 'key',
    });
    this.version(4).stores({
      memories: 'id, articleId, type, updatedAt, *tags',
    });
  }
}

export const db = new PaperDB();
