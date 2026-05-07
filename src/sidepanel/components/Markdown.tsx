import React from 'react';

// Minimal, dependency-free markdown -> HTML.
// Handles: # h1-h3, **bold**, *em*, `code`, lists, paragraphs.
function escape(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };

  function inline(s: string) {
    let r = escape(s);
    r = r.replace(/`([^`]+)`/g, '<code>$1</code>');
    r = r.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    r = r.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return r;
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); closeList(); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flushPara(); closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) { flushPara(); if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; } out.push(`<li>${inline(ul[1])}</li>`); continue; }
    const ol = /^(\d+)[.、)]\s+(.*)$/.exec(line);
    if (ol) { flushPara(); if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; } out.push(`<li>${inline(ol[2])}</li>`); continue; }
    closeList();
    para.push(line);
  }
  flushPara(); closeList();
  return <div className="prose-paper" dangerouslySetInnerHTML={{ __html: out.join('') }} />;
}
