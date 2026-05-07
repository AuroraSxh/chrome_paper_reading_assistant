import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Article } from '../lib/messages';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 200;
const MAX_TEXT_CHARS = 600_000;

const JUNK_TITLE_RE = /^(microsoft word|untitled|document\d*|paper(_v\d+)?|[\s\d._\-]+)$/i;

// Adobe Acrobat Chrome extension hijacks PDF tabs and produces URLs of the
// form chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/file:///path.pdf
// We detect that pattern and unwrap the inner URL.
function unwrapAdobeUrl(u: string): string | null {
  const m = u.match(/^chrome-extension:\/\/[a-z]+\/(file:\/\/\/.+\.pdf(?:[?#].*)?)$/i);
  return m ? m[1] : null;
}

function filenameFromUrl(u: string): string {
  try {
    const path = new URL(u).pathname;
    const base = decodeURIComponent(path.split('/').pop() || 'document.pdf');
    return base.replace(/\.pdf$/i, '');
  } catch {
    return 'PDF Document';
  }
}

/** Resolve a tab URL to a fetchable PDF URL, or null if not a PDF. */
export function resolvePdfUrl(u: string | undefined | null): string | null {
  if (!u) return null;
  // Adobe Acrobat extension wraps file:// URLs.
  const inner = unwrapAdobeUrl(u);
  if (inner) return inner;
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'file:') return null;
    if (/\.pdf(?:$|\?|#)/i.test(url.pathname + url.search)) return u;
    return null;
  } catch {
    return null;
  }
}

export function isPdfUrl(u: string | undefined | null): boolean {
  return resolvePdfUrl(u) !== null;
}

export interface PdfExtractOptions {
  signal?: AbortSignal;
}

export async function extractPdfArticle(rawUrl: string, opts: PdfExtractOptions = {}): Promise<Article> {
  const { signal } = opts;
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  const url = resolvePdfUrl(rawUrl) ?? rawUrl;
  const isFile = url.startsWith('file://');

  let buf: ArrayBuffer;
  try {
    const res = await fetch(url, {
      signal,
      // Local files don't have credentials; remote PDFs we explicitly omit.
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`PDF fetch ${res.status}`);
    buf = await res.arrayBuffer();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (isFile) {
      throw new Error(
        `读取本地 PDF 失败：${msg}。请在 chrome://extensions 找到本扩展，打开"详情" → 启用"允许访问文件网址"。如果是 Adobe Acrobat 扩展接管了 PDF 显示，可以在那里禁用 Adobe，让 Chrome 用自带阅读器。`,
      );
    }
    throw e;
  }
  checkAbort();

  const loadingTask = pdfjsLib.getDocument({ data: buf, isEvalSupported: false });
  signal?.addEventListener('abort', () => { loadingTask.destroy().catch(() => {}); });
  const pdf = await loadingTask.promise;

  let title: string | undefined;
  let authors: string[] | undefined;
  let abstract: string | undefined;
  try {
    const meta = await pdf.getMetadata();
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    if (typeof info.Title === 'string') {
      const t = info.Title.trim();
      if (t && !JUNK_TITLE_RE.test(t)) title = t;
    }
    if (typeof info.Author === 'string' && info.Author.trim()) {
      authors = info.Author.split(/[;,，、]\s*/).map((s) => s.trim()).filter(Boolean);
    }
    if (typeof info.Subject === 'string' && info.Subject.trim()) abstract = info.Subject.trim();
  } catch { /* ignore */ }

  const pageTexts: string[] = [];
  let charCount = 0;
  const totalPages = Math.min(pdf.numPages, MAX_PAGES);
  for (let i = 1; i <= totalPages; i++) {
    checkAbort();
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const lines: string[] = [];
    let buffer = '';
    let lastY: number | null = null;
    for (const item of tc.items as Array<{ str: string; transform?: number[]; hasEOL?: boolean }>) {
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        if (buffer.trim()) lines.push(buffer.trim());
        buffer = '';
      }
      buffer += item.str + (item.hasEOL ? '\n' : ' ');
      lastY = y;
    }
    if (buffer.trim()) lines.push(buffer.trim());
    const pageText = lines.join('\n');
    pageTexts.push(pageText);
    charCount += pageText.length;
    page.cleanup();
    if (charCount > MAX_TEXT_CHARS) {
      pageTexts.push(`\n[... PDF 后续页面已省略，共 ${pdf.numPages} 页 ...]`);
      break;
    }
  }
  await loadingTask.destroy();

  const fullText = pageTexts.join('\n\n').replace(/[ \t]+/g, ' ').trim();

  if (!title) {
    const firstLine = fullText.split('\n').map((l) => l.trim()).find((l) => l.length >= 8 && l.length <= 200);
    if (firstLine) title = firstLine;
  }
  if (!title) title = filenameFromUrl(url);

  const doiMatch = fullText.match(/\b10\.\d{4,9}\/[-._;()/:a-z0-9A-Z]+/);
  const doi = doiMatch?.[0];

  return {
    url,
    title,
    authors,
    doi,
    abstract,
    fullText,
    source: 'pdf',
    extractedAt: Date.now(),
    kind: 'pdf',
  };
}
