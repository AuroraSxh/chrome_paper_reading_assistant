export function metaContent(name: string): string | undefined {
  const sel = `meta[name="${name}"], meta[property="${name}"]`;
  const els = document.querySelectorAll<HTMLMetaElement>(sel);
  for (const el of els) {
    const c = el.content?.trim();
    if (c) return c;
  }
  return undefined;
}

export function metaAll(name: string): string[] {
  const sel = `meta[name="${name}"], meta[property="${name}"]`;
  return [...document.querySelectorAll<HTMLMetaElement>(sel)]
    .map((el) => el.content?.trim())
    .filter((c): c is string => Boolean(c));
}

export function getDOI(): string | undefined {
  const m = metaContent('citation_doi') || metaContent('dc.identifier') || metaContent('prism.doi');
  if (!m) return undefined;
  return m.replace(/^doi:/i, '').trim();
}

export function getJournal(): string | undefined {
  return metaContent('citation_journal_title') || metaContent('prism.publicationName') || metaContent('og:site_name');
}

export function getAuthors(): string[] {
  const list = metaAll('citation_author');
  if (list.length) return list;
  const dc = metaAll('dc.creator');
  return dc;
}

export function getTitle(): string {
  return (
    metaContent('citation_title') ||
    metaContent('og:title') ||
    document.querySelector('h1')?.textContent?.trim() ||
    document.title
  ).trim();
}

export function getAbstract(): string | undefined {
  return metaContent('citation_abstract') || metaContent('description') || metaContent('og:description');
}

export function getPublishedAt(): string | undefined {
  return metaContent('citation_publication_date') || metaContent('article:published_time') || metaContent('prism.publicationDate');
}

export function cleanText(node: Element | null | undefined): string {
  if (!node) return '';
  const clone = node.cloneNode(true) as Element;
  // Remove obvious noise
  clone.querySelectorAll(
    'script,style,nav,aside,form,figure figcaption,.fig,.figure,button,[aria-hidden="true"],.c-ad,.advertisement'
  ).forEach((n) => n.remove());
  return (clone.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function pickFirst(...selectors: string[]): Element | null {
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}
