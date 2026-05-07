// Proper SSE event parser per WHATWG/W3C spec:
// - events are separated by a blank line ("\n\n")
// - within an event, fields are key:value lines
// - multiple "data:" lines in one event are joined with "\n"
// - lines starting with ":" are comments / heartbeats and ignored
// Yields parsed event objects.

export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
}

export async function* iterSSE(response: Response): AsyncGenerator<SSEEvent> {
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parseBlock = (block: string): SSEEvent | null => {
    const lines = block.split(/\r?\n/);
    let eventName: string | undefined;
    let id: string | undefined;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      const idx = line.indexOf(':');
      const field = idx === -1 ? line : line.slice(0, idx);
      let value = idx === -1 ? '' : line.slice(idx + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'data') dataLines.push(value);
      else if (field === 'event') eventName = value;
      else if (field === 'id') id = value;
    }
    if (dataLines.length === 0) return null;
    return { event: eventName, data: dataLines.join('\n'), id };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIdx: number;
    while ((sepIdx = findSeparator(buffer)) !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + sepLen(buffer, sepIdx));
      const evt = parseBlock(block);
      if (evt) yield evt;
    }
  }
  // flush trailing
  if (buffer.trim()) {
    const evt = parseBlock(buffer);
    if (evt) yield evt;
  }
}

function findSeparator(s: string): number {
  const a = s.indexOf('\n\n');
  const b = s.indexOf('\r\n\r\n');
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}
function sepLen(s: string, idx: number): number {
  return s.startsWith('\r\n\r\n', idx) ? 4 : 2;
}
