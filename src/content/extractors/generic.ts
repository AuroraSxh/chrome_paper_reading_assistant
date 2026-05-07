import { Readability } from '@mozilla/readability';
import type { Article } from '../../lib/messages';
import { getAbstract, getAuthors, getDOI, getJournal, getPublishedAt, getTitle } from './util';

export const id = 'generic';
export const matches = (_url: URL) => true;

export function extract(): Article {
  const docClone = document.cloneNode(true) as Document;
  let fullText = '';
  try {
    const parsed = new Readability(docClone).parse();
    fullText = parsed?.textContent?.trim() || '';
  } catch {
    fullText = '';
  }
  if (!fullText) {
    fullText = (document.querySelector('main')?.textContent || document.body.textContent || '').trim();
  }
  return {
    url: location.href,
    title: getTitle(),
    journal: getJournal(),
    authors: getAuthors(),
    doi: getDOI(),
    abstract: getAbstract(),
    fullText,
    publishedAt: getPublishedAt(),
    source: id,
    extractedAt: Date.now(),
  };
}
