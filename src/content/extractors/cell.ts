import type { Article } from '../../lib/messages';
import { cleanText, getAbstract, getAuthors, getDOI, getJournal, getPublishedAt, getTitle, pickFirst } from './util';

export const id = 'cell';
export const matches = (url: URL) => url.hostname === 'www.cell.com';

export function extract(): Article {
  const body = pickFirst(
    'article .article__body',
    'section.article-section__content',
    'article',
    'main'
  );
  return {
    url: location.href,
    title: getTitle(),
    journal: getJournal(),
    authors: getAuthors(),
    doi: getDOI(),
    abstract: getAbstract(),
    fullText: cleanText(body),
    publishedAt: getPublishedAt(),
    source: id,
    extractedAt: Date.now(),
  };
}
