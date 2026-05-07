import type { Article } from '../../lib/messages';
import { cleanText, getAbstract, getAuthors, getDOI, getJournal, getPublishedAt, getTitle, pickFirst } from './util';

export const id = 'nature';
export const matches = (url: URL) => /(^|\.)nature\.com$/.test(url.hostname);

export function extract(): Article {
  const body = pickFirst(
    'article main',
    'article',
    '[data-track-component="article body"]',
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
