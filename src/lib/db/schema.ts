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

export class PaperDB extends Dexie {
  articles!: Table<ArticleRow, string>;
  summaries!: Table<SummaryRow, number>;
  conversations!: Table<ConversationRow, number>;
  messages!: Table<MessageRow, number>;
  kv!: Table<KvRow, string>;

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
  }
}

export const db = new PaperDB();
