import type { ContentRequest, ContentResponse } from '../lib/messages';
import { extractArticle } from './extractors';

chrome.runtime.onMessage.addListener(
  (msg: ContentRequest, _sender, sendResponse: (r: ContentResponse) => void) => {
    try {
      if (msg.type === 'EXTRACT_ARTICLE') {
        // Always re-extract on demand; this handles SPA navigations on
        // ScienceDirect / Nature where document content swaps without reload.
        const article = extractArticle();
        sendResponse({ ok: true, article });
        return false;
      }
      if (msg.type === 'GET_SELECTION') {
        const selection = window.getSelection()?.toString() ?? '';
        sendResponse({ ok: true, selection });
        return false;
      }
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
    return false;
  }
);
