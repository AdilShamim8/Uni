// Tiny, safe Markdown → React renderer (no dangerouslySetInnerHTML).
// Supports paragraphs, lists, headings, quotes, code blocks, **bold**, _italic_, `code`,
// [links](https://…) and citation chips [n].
import React from "react";

type OnCite = (n: number) => void;

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\[\d{1,3}\](?!\()|(?:^|(?<=[\s(]))_[^_]+_(?=[\s.,!?)]|$))/g;

function inline(text: string, onCite: OnCite | undefined, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<b key={k}>{tok.slice(2, -2)}</b>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("_")) out.push(<i key={k}>{tok.slice(1, -1)}</i>);
    else if (/^\[\d{1,3}\]$/.test(tok)) {
      const n = Number(tok.slice(1, -1));
      out.push(<button key={k} className="cite" onClick={() => onCite?.(n)} title={`Source ${n}`}>{n}</button>);
    } else {
      const mm = tok.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (mm) out.push(<a key={k} href={mm[2]} target="_blank" rel="noopener noreferrer">{mm[1]}</a>);
      else out.push(tok);
    }
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, onCite, className = "" }: { text: string; onCite?: OnCite; className?: string }) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;
  const flush = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, onCite, `${k}${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={k}>{items}</ol> : <ul key={k}>{items}</ul>);
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.startsWith("```")) {
      if (code) { blocks.push(<pre key={`c${idx}`}><code>{code.join("\n")}</code></pre>); code = null; }
      else { flush(); code = []; }
      return;
    }
    if (code) { code.push(raw); return; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; } list.items.push(m[1]); return; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; } list.items.push(m[1]); return; }
    flush();
    if (!line.trim()) return;
    if ((m = line.match(/^#{1,4}\s+(.*)/))) blocks.push(<h3 key={idx}>{inline(m[1], onCite, `h${idx}`)}</h3>);
    else if ((m = line.match(/^>\s?(.*)/))) blocks.push(<blockquote key={idx}>{inline(m[1], onCite, `q${idx}`)}</blockquote>);
    else blocks.push(<p key={idx}>{inline(line, onCite, `p${idx}`)}</p>);
  });
  flush();
  if (code) blocks.push(<pre key="cend"><code>{(code as string[]).join("\n")}</code></pre>);
  return <div className={`md ${className}`}>{blocks}</div>;
}
