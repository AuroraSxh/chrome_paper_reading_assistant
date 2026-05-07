import { PORT_NAME, type BgToPanel, type PanelToBg } from '../lib/messages';

type Handler = (msg: BgToPanel) => void;

class PortClient {
  private port: chrome.runtime.Port | null = null;
  private listeners = new Set<Handler>();
  private oneShots = new Map<string, Handler>();

  connect() {
    if (this.port) return;
    this.port = chrome.runtime.connect({ name: PORT_NAME });
    this.port.onMessage.addListener((m: BgToPanel) => {
      const oneShot = this.oneShots.get(m.requestId);
      if (oneShot) oneShot(m);
      for (const fn of this.listeners) fn(m);
      if (m.type !== 'DELTA') this.oneShots.delete(m.requestId);
    });
    this.port.onDisconnect.addListener(() => {
      // Service worker may be killed unexpectedly. Synthesize ABORTED for every
      // pending request so component handlers can finalize and not hang the UI.
      const pending = [...this.oneShots.entries()];
      this.oneShots.clear();
      this.port = null;
      for (const [requestId, fn] of pending) {
        try {
          fn({ type: 'ABORTED', requestId });
        } catch { /* ignore */ }
      }
    });
  }

  send(msg: PanelToBg) {
    if (!this.port) this.connect();
    this.port?.postMessage(msg);
  }

  bind(requestId: string, fn: Handler) {
    this.oneShots.set(requestId, fn);
    return () => this.oneShots.delete(requestId);
  }

  on(fn: Handler) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const portClient = new PortClient();
