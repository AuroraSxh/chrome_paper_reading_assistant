import { useStore } from './store';
import { portClient } from './port';
import { newRequestId } from '../lib/messages';
import { extractPdfArticle, isPdfUrl, resolvePdfUrl } from './pdf';

let activePdfController: { id: string; ctrl: AbortController } | null = null;

const SUPPORTED_HOST_PATTERNS = [
  /(^|\.)nature\.com$/i,
  /^www\.cell\.com$/i,
  /^www\.science\.org$/i,
  /^www\.sciencedirect\.com$/i,
  /^onlinelibrary\.wiley\.com$/i,
  /^link\.springer\.com$/i,
  /^www\.pnas\.org$/i,
  /^journals\.plos\.org$/i,
  /^academic\.oup\.com$/i,
  /^pubs\.acs\.org$/i,
  /^pubs\.rsc\.org$/i,
  /^www\.embopress\.org$/i,
  /^elifesciences\.org$/i,
  /^www\.biorxiv\.org$/i,
  /^www\.medrxiv\.org$/i,
];

function classifyUrl(raw: string | undefined): 'pdf' | 'publisher' | 'other-http' | 'unsupported' {
  if (!raw) return 'unsupported';
  if (isPdfUrl(raw)) return 'pdf';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'unsupported';
    return SUPPORTED_HOST_PATTERNS.some((re) => re.test(u.hostname)) ? 'publisher' : 'other-http';
  } catch {
    return 'unsupported';
  }
}

void resolvePdfUrl; // re-export side effect; keep import alive for tree-shaking

/** Fetch article for the given tab, dispatching to PDF or HTML extractor. */
export async function triggerExtract(tabId: number, tabUrl?: string): Promise<void> {
  const s = useStore.getState();
  let url = tabUrl;
  if (!url) {
    try { url = (await chrome.tabs.get(tabId)).url; } catch { /* ignore */ }
  }
  s.setError(null);

  const kind = classifyUrl(url);

  if (kind === 'unsupported' || kind === 'other-http') {
    // chrome:// / new tab page / non-publisher http page — don't bug background
    // with an extract that will only fail with "Receiving end does not exist".
    // Just leave article=null so the empty-state message shows.
    if (activePdfController) { activePdfController.ctrl.abort(); activePdfController = null; }
    s.setExtractRequestId(null);
    s.setLoadingArticle(false);
    s.setArticle(null);
    return;
  }

  if (kind === 'pdf') {
    activePdfController?.ctrl.abort();
    const reqId = newRequestId();
    const ctrl = new AbortController();
    activePdfController = { id: reqId, ctrl };
    s.setExtractRequestId(reqId);
    s.setLoadingArticle(true);
    try {
      const article = await extractPdfArticle(url!, { signal: ctrl.signal });
      if (useStore.getState().extractRequestId !== reqId) return;
      s.setArticle(article);
      s.setExtractRequestId(null);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (useStore.getState().extractRequestId !== reqId) return;
      s.setLoadingArticle(false);
      s.setExtractRequestId(null);
      s.setError(`PDF 解析失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (activePdfController?.id === reqId) activePdfController = null;
    }
    return;
  }

  if (activePdfController) { activePdfController.ctrl.abort(); activePdfController = null; }
  const reqId = newRequestId();
  s.setExtractRequestId(reqId);
  s.setLoadingArticle(true);
  portClient.send({ type: 'EXTRACT', tabId, requestId: reqId });
}

export function abortPdfExtract(): void {
  activePdfController?.ctrl.abort();
  activePdfController = null;
}
