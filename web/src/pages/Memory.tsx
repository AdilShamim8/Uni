import { motion } from "framer-motion";
import { Pin, PinOff, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Empty, Modal, Switch, ToggleRow } from "../components/ui";
import { ago, del, get, patch, post, put } from "../lib/api";
import { useApp } from "../lib/store";
import type { ContextItem } from "../lib/turn";

const LOOK: Record<string, [string, string]> = {
  upload: ["📁", "Files you upload here."], notes: ["📝", "Notes you or your Bots save."],
  episodes: ["💬", "Past conversations, so Bots remember context."], gdrive: ["🟢", "Folders you choose from Google Drive (read-only)."],
};

export function MemoryPage() {
  const { toast, refresh } = useApp();
  const [m, setM] = useState<any>(null);
  const [drive, setDrive] = useState<any>(null);
  const [fact, setFact] = useState("");
  const [peekQ, setPeekQ] = useState("");
  const [peek, setPeek] = useState<any>(null);
  const [docs, setDocs] = useState<Record<string, any[] | undefined>>({});
  const [picker, setPicker] = useState(false);
  const loc = useLocation();
  const load = useCallback(async () => { const [a, b] = await Promise.all([get("/api/memory"), get("/api/drive/status")]); setM(a); setDrive(b); }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => {
    const p = new URLSearchParams(loc.search).get("drive");
    if (p === "connected") toast("Google Drive connected — now pick folders 🎉");
    if (p === "error") toast("Google sign-in didn't finish. Please try again.", true);
  }, [loc.search, toast]);
  if (!m) return <div className="page"><div className="tiny">Loading…</div></div>;

  const sources = m.sources.filter((s: any) => s.kind !== "gdrive");
  const gsrc = m.sources.find((s: any) => s.kind === "gdrive");

  return (
    <div className="page">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow"><div className="eyebrow">Memory</div><h1 className="h-page">What your Bots may know</h1>
          <p className="muted">Only what you switch on is ever searched. <b>Private 🔒</b> sources go only to brains on this computer. Passwords and keys are hidden automatically. You can forget anything, anytime.</p></div>
        <div className="glass" style={{ padding: "8px 14px", minWidth: 260 }}>
          <ToggleRow title="Pause all memory" hint="Bots answer without your data" checked={m.paused} onChange={async (v) => { await post("/api/memory/pause", { paused: v }); load(); refresh(); }} />
        </div>
      </div>

      <section className="section">
        <div className="head"><h2>Sources</h2><span className="tiny">{m.stats.documents} documents · {m.stats.chunks} searchable pieces · {m.stats.facts} facts</span></div>
        <div className="grid srcgrid">
          <DriveCard drive={drive} src={gsrc} onChange={load} onPick={() => setPicker(true)} />
          {sources.map((s: any) => (
            <div key={s.id} className="glass card col">
              <div className="row"><span style={{ fontSize: 26 }}>{LOOK[s.kind]?.[0] || "📦"}</span>
                <div className="grow"><b>{s.name}</b><div className="tiny">{s.doc_count} item{s.doc_count === 1 ? "" : "s"}</div></div></div>
              <div className="small muted">{LOOK[s.kind]?.[1]}</div>
              {s.kind === "upload" && <Dropzone onDone={() => { load(); refresh(); }} />}
              <SourceToggles s={s} onChange={load} />
              <div className="row">
                <button className="btn sm ghost" onClick={async () => setDocs({ ...docs, [s.id]: docs[s.id] ? undefined : (await get(`/api/memory/sources/${s.id}/documents`)).documents })}>{docs[s.id] ? "Hide items" : "See items"}</button>
                {s.doc_count > 0 && <button className="btn sm ghost" onClick={async () => { if (confirm("Forget everything in this source?")) { await del(`/api/memory/sources/${s.id}`); load(); refresh(); } }}>Forget all</button>}
              </div>
              {docs[s.id] && <div className="col" style={{ gap: 4, maxHeight: 200, overflow: "auto" }}>
                {docs[s.id]!.map((d) => <div key={d.id} className="row small" style={{ gap: 6 }}><span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {d.title}</span>
                  <span className="tiny">{ago(d.created_at)}</span><button className="btn sm ghost icon" aria-label="Forget" onClick={async () => { await del(`/api/memory/documents/${d.id}`); setDocs({ ...docs, [s.id]: docs[s.id]!.filter((x) => x.id !== d.id) }); load(); }}><Trash2 size={13} /></button></div>)}
                {!docs[s.id]!.length && <span className="tiny">Empty</span>}
              </div>}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="head"><h2>💡 Things your Bots remember about you</h2><span className="tiny">Pinned facts are always in mind</span></div>
        <div className="glass card">
          <form className="row" onSubmit={async (e) => { e.preventDefault(); if (!fact.trim()) return; await post("/api/memory/facts", { text: fact }); setFact(""); toast("Got it — remembered."); load(); }}>
            <input className="field grow" value={fact} onChange={(e) => setFact(e.target.value)} placeholder="e.g. I work night shifts on weekends" /><button className="btn primary">Remember</button>
          </form>
          <div className="col" style={{ marginTop: 12 }}>
            {m.facts.map((f: any) => (
              <motion.div key={f.id} layout className={`fact ${f.pinned ? "pinned" : ""}`}>
                <span className="grow">{f.text}</span>
                <button className="btn sm ghost icon" title={f.pinned ? "Unpin" : "Pin"} onClick={async () => { await patch(`/api/memory/facts/${f.id}`, { pinned: !f.pinned }); load(); }}>{f.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
                <button className="btn sm ghost icon" title="Forget" onClick={async () => { await del(`/api/memory/facts/${f.id}`); toast("Forgotten"); load(); }}><Trash2 size={14} /></button>
              </motion.div>
            ))}
            {!m.facts.length && <Empty icon="🌱">Nothing yet. Tell your Bots things, or say “remember that…”. They always ask before saving.</Empty>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="head"><h2>🔍 Peek: what would a Bot see?</h2><span className="tiny">Preview exactly what gets pulled from memory</span></div>
        <div className="glass card">
          <form className="row" onSubmit={async (e) => { e.preventDefault(); setPeek(await post("/api/memory/search", { query: peekQ })); }}>
            <input className="field grow" value={peekQ} onChange={(e) => setPeekQ(e.target.value)} placeholder="e.g. when is rent due" /><button className="btn">Peek</button>
          </form>
          {peek && <div className="col" style={{ marginTop: 12 }}>
            {peek.used.map((it: ContextItem) => <div key={it.n} className="ritem open"><div className="top"><span className="n">{it.n}</span>{it.title}{it.private && <span className="pill priv">🔒</span>}</div><div className="src">{it.source}</div><div className="snip">{it.text}</div></div>)}
            {!peek.used.length && <div className="leftout">Nothing would be used.</div>}
            {peek.left_out.map((x: any, i: number) => <div key={i} className="leftout"><b>{x.title}</b> — {x.reason}</div>)}
            {peek.secrets_hidden > 0 && <div className="leftout">🔐 {peek.secrets_hidden} secret(s) would be hidden.</div>}
          </div>}
        </div>
      </section>
      <FolderPicker open={picker} selected={drive?.folders || []} onClose={() => setPicker(false)} onSaved={load} />
    </div>
  );
}

function SourceToggles({ s, onChange }: { s: any; onChange: () => void }) {
  const { toast } = useApp();
  const set = async (k: string, v: boolean) => { await patch(`/api/memory/sources/${s.id}`, { [k]: v }); toast(k === "private" ? (v ? "Private: only on-device brains will see this" : "No longer private") : v ? "Bots can use this again" : "Hidden from Bots"); onChange(); };
  return (
    <div>
      <ToggleRow title="Bots can use this" hint="Off = invisible to every Bot" checked={s.enabled} onChange={(v) => set("enabled", v)} />
      <ToggleRow title="Private 🔒" hint="Only shared with brains on this computer" checked={s.private} onChange={(v) => set("private", v)} />
    </div>
  );
}

function Dropzone({ onDone }: { onDone: () => void }) {
  const { toast } = useApp();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function send(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    setBusy(true);
    try {
      const { results } = await post<{ results: any[] }>("/api/memory/upload", fd as any);
      const ok = results.filter((r) => r.ok).length;
      toast(`Learned from ${ok} file${ok === 1 ? "" : "s"} 🧠`, ok === 0);
      results.filter((r) => !r.ok).forEach((r) => toast(`${r.name}: ${r.reason}`, true));
      onDone();
    } catch (e: any) { toast(e.message, true); } finally { setBusy(false); }
  }
  return (
    <div className={`drop ${over ? "over" : ""}`} onClick={() => input.current?.click()} role="button" tabIndex={0}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}>
      <Upload size={18} style={{ verticalAlign: -3 }} /> {busy ? "Reading your files…" : "Drop files or click to upload"}
      <div className="tiny">PDF · Word · Markdown · text · CSV · HTML</div>
      <input ref={input} type="file" multiple hidden onChange={(e) => send(e.target.files)} />
    </div>
  );
}

function DriveCard({ drive, src, onChange, onPick }: { drive: any; src: any; onChange: () => void; onPick: () => void }) {
  const { toast } = useApp();
  const [cid, setCid] = useState("");
  const [sec, setSec] = useState("");
  const [busy, setBusy] = useState(false);
  if (!drive) return null;
  return (
    <div className="glass card col">
      <div className="row"><span style={{ fontSize: 26 }}>🟢</span><div className="grow"><b>Google Drive</b><div className="tiny">{drive.connected ? `Connected${drive.account ? " as " + drive.account : ""}` : "Not connected"}</div></div></div>
      <div className="small muted">Read-only. You choose the folders; Bots never see the rest and can't change anything.</div>
      {!drive.configured && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Set up Google access (one time, ~5 min)</summary>
          <ol className="small muted" style={{ paddingLeft: 18 }}>
            <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud → Credentials</a>, enable the Google Drive API.</li>
            <li>Create an OAuth client ID of type <b>Web application</b>.</li>
            <li>Add redirect URI: <code>{drive.redirect_uri}</code></li>
          </ol>
          <input className="field" placeholder="Client ID" value={cid} onChange={(e) => setCid(e.target.value)} style={{ marginBottom: 8 }} />
          <input className="field" type="password" placeholder="Client secret" value={sec} onChange={(e) => setSec(e.target.value)} />
          <button className="btn sm primary" style={{ marginTop: 10 }} onClick={async () => { await put("/api/settings", { google_client_id: cid.trim(), google_client_secret: sec.trim() }); toast("Saved — now connect"); onChange(); }}>Save</button>
        </details>
      )}
      {drive.configured && !drive.connected && <a className="btn primary" href="/api/drive/connect">Connect Google Drive</a>}
      {drive.connected && (
        <>
          <div>{drive.folders.length ? drive.folders.map((f: any) => <span key={f.id} className="tag">📂 {f.name}</span>) : <span className="tiny">No folders chosen yet.</span>}</div>
          <div className="row"><button className="btn sm" onClick={onPick}>Choose folders</button>
            <button className="btn sm mint" disabled={!drive.folders.length || busy} onClick={async () => {
              setBusy(true);
              try { const { stats } = await post("/api/drive/sync"); toast(`Synced: ${stats.indexed} new/updated, ${stats.unchanged} unchanged, ${stats.removed} removed`); }
              catch (e: any) { toast(e.message, true); } finally { setBusy(false); onChange(); }
            }}>{busy ? "Syncing…" : "Sync now"}</button></div>
          <div className="tiny">{drive.last_sync ? `Last synced ${ago(drive.last_sync)}` : "Never synced"} · {src ? `${src.doc_count} files` : "0 files"}</div>
          {src && <SourceToggles s={src} onChange={onChange} />}
          <button className="btn sm ghost" onClick={async () => { if (confirm("Disconnect Drive and forget its files?")) { await post("/api/drive/disconnect"); onChange(); } }}>Disconnect</button>
        </>
      )}
    </div>
  );
}

function FolderPicker({ open, selected, onClose, onSaved }: { open: boolean; selected: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [trail, setTrail] = useState([{ id: "root", name: "My Drive" }]);
  const [folders, setFolders] = useState<any[]>([]);
  const [chosen, setChosen] = useState<Record<string, any>>({});
  useEffect(() => { if (open) setChosen(Object.fromEntries(selected.map((f) => [f.id, f]))); }, [open, selected]);
  useEffect(() => {
    if (!open) return;
    const cur = trail[trail.length - 1];
    get(`/api/drive/folders?parent=${encodeURIComponent(cur.id)}`).then((r) => setFolders(r.folders)).catch((e) => toast(e.message, true));
  }, [open, trail, toast]);
  return (
    <Modal open={open} onClose={onClose} label="Choose folders">
      <h2>📂 Choose folders</h2>
      <p className="muted small">Bots only read files inside the folders you tick (and their subfolders).</p>
      <div className="tiny">{trail.map((t, i) => <a key={t.id} style={{ cursor: "pointer" }} onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}{i < trail.length - 1 ? " › " : ""}</a>)}</div>
      <div className="col" style={{ margin: "10px 0", maxHeight: 300, overflow: "auto" }}>
        {folders.map((f) => (
          <div key={f.id} className="soft row" style={{ padding: "8px 12px" }}>
            <Switch checked={!!chosen[f.id]} onChange={(v) => { const c = { ...chosen }; if (v) c[f.id] = f; else delete c[f.id]; setChosen(c); }} label={f.name} />
            <span className="grow">📁 {f.name}</span><button className="btn sm ghost" onClick={() => setTrail([...trail, f])}>Open ›</button>
          </div>
        ))}
        {!folders.length && <div className="tiny">No subfolders here.</div>}
      </div>
      <div className="modal-actions"><span className="grow tiny">{Object.keys(chosen).length} selected</span>
        <button className="btn primary" onClick={async () => { await post("/api/drive/folders", { folders: Object.values(chosen) }); toast("Folders saved — press Sync now"); onSaved(); onClose(); }}>Save</button></div>
    </Modal>
  );
}
