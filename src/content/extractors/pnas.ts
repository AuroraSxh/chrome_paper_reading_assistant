import type { Article } from '../../lib/messages';
import { cleanText, getAbstract, getAuthors, getDOI, getJournal, getPublishedAt, getTitle, pickFirst } from './util';

export const id = 'pnas';
export const matches = (url: URL) => url.hostname === 'www.pnas.org';

export function extract(): Article {
  const body = pickFirst('#bodymatter', 'main article', 'article', 'main');
  return {
    url: location.href,
    title: getTitle(),
    journal: getJournal() || 'PNAS',
    authors: getAuthors(),
    doi: getDOI(),
    abstract: getAbstract(),
    fullText: cleanText(body),
    publishedAt: getPublishedAt(),
    source: id,
    extractedAt: Date.now(),
  };
}
