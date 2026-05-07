import type { Article } from '../../lib/messages';
import { cleanText, getAbstract, getAuthors, getDOI, getJournal, getPublishedAt, getTitle, pickFirst } from './util';

export const id = 'wiley';
export const matches = (url: URL) => url.hostname === 'onlinelibrary.wiley.com';

export function extract(): Article {
  const body = pickFirst('section.article-section__full', 'div.article__body', 'article', 'main');
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
