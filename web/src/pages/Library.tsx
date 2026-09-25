import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Copy, Empty } from "../components/ui";
import { ago, del, get, patch } from "../lib/api";

export function Library() {
  const [tab, setTab] = useState<"todos" | "notes" | "drafts">("todos");
  const [lib, setLib] = useState<any>({ todos: [], notes: [], drafts: [] });
  const load = useCallback(() => get("/api/library").then(setLib), []);
  useEffect(() => { load().catch(() => {}); }, [load]);
  const open = lib.todos.filter((t: any) => !t.done).length;
  return (
    <div className="page">
      <div className="eyebrow">Library</div>
      <h1 className="h-page">Things your Bots made</h1>
      <p className="muted">To-dos, notes and drafts. Drafts are <b>never</b> sent — you're always the one who hits send.</p>
      <div className="tabsbar"><div className="seg">
        <button className={tab === "todos" ? "on" : ""} onClick={() => setTab("todos")}>To-dos · {open}</button>
        <button className={tab === "notes" ? "on" : ""} onClick={() => setTab("notes")}>Notes · {lib.notes.length}</button>
        <button className={tab === "drafts" ? "on" : ""} onClick={() => setTab("drafts")}>Drafts · {lib.drafts.length}</button>
      </div></div>
      <div className="list">
        {tab === "todos" && (lib.todos.length ? lib.todos.map((t: any) => (
          <div key={t.id} className="glass item" style={{ opacity: t.done ? 0.55 : 1 }}>
            <input type="checkbox" checked={!!t.done} onChange={async (e) => { await patch(`/api/library/todos/${t.id}`, { done: e.target.checked }); load(); }} style={{ width: 18, height: 18, marginTop: 3, accentColor: "var(--accent)" }} />
            <div className="grow"><b style={{ textDecoration: t.done ? "line-through" : "none" }}>{t.text}</b><div className="tiny">{t.due ? `Due ${t.due} · ` : ""}{ago(t.created_at)}</div></div>
            <button className="btn sm ghost icon" aria-label="Delete" onClick={async () => { await del(`/api/library/todos/${t.id}`); load(); }}><Trash2 size={14} /></button>
          </div>)) : <Empty icon="✅">No to-dos. Try “Remind me to…”.</Empty>)}
        {tab === "notes" && (lib.notes.length ? lib.notes.map((n: any) => (
          <div key={n.id} className="glass item"><div className="grow"><b>{n.title}</b><pre>{n.content}</pre><div className="tiny">{ago(n.created_at)}</div></div>
            <button className="btn sm ghost icon" aria-label="Delete" onClick={async () => { await del(`/api/library/notes/${n.id}`); load(); }}><Trash2 size={14} /></button></div>)) : <Empty icon="📝">No notes yet.</Empty>)}
        {tab === "drafts" && (lib.drafts.length ? lib.drafts.map((d: any) => (
          <div key={d.id} className="glass item"><div className="grow"><b>{d.subject || "(no subject)"}</b>{d.to_addr && <div className="tiny">To: {d.to_addr}</div>}<pre>{d.body}</pre>
            <div className="row" style={{ marginTop: 10 }}><Copy text={`Subject: ${d.subject}\n\n${d.body}`} />
              <a className="btn sm ghost" href={`mailto:${encodeURIComponent(d.to_addr || "")}?subject=${encodeURIComponent(d.subject || "")}&body=${encodeURIComponent(d.body || "")}`}>Open in my email app</a></div></div>
            <button className="btn sm ghost icon" aria-label="Delete" onClick={async () => { await del(`/api/library/drafts/${d.id}`); load(); }}><Trash2 size={14} /></button></div>)) : <Empty icon="✉️">No drafts. Try the “Draft a reply” routine.</Empty>)}
      </div>
    </div>
  );
}
