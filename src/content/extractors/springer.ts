import type { Article } from '../../lib/messages';
import { cleanText, getAbstract, getAuthors, getDOI, getJournal, getPublishedAt, getTitle, pickFirst } from './util';

export const id = 'springer';
export const matches = (url: URL) => url.hostname === 'link.springer.com';

export function extract(): Article {
  const body = pickFirst('main#main-content article', 'main article', 'article', 'main');
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
