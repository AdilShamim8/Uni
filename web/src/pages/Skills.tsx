import { motion } from "framer-motion";
import { Download, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Empty, Modal } from "../components/ui";
import { ago, del, get, patch, post, type Skill } from "../lib/api";
import { useApp } from "../lib/store";

type Tab = "proposed" | "active" | "disabled";

export function Skills() {
  const { toast, refresh, botById } = useApp();
  const [tab, setTab] = useState<Tab>("active");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ skills: Skill[]; counts: Record<string, number>; hermes_library: boolean }>({ skills: [], counts: {}, hermes_library: false });
  const [view, setView] = useState<Skill | null>(null);
  const [create, setCreate] = useState(false);
  const load = useCallback(() => get(`/api/skills?status=${tab}&q=${encodeURIComponent(q)}`).then(setData), [tab, q]);
  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { get("/api/skills?status=proposed").then((d) => { if (d.counts.proposed) setTab("proposed"); }).catch(() => {}); }, []);

  async function setStatus(s: Skill, status: string) {
    await patch(`/api/skills/${s.id}`, { status });
    toast(status === "active" ? `“${s.name}” is on — your Bots will use it` : "Skill turned off");
    load(); refresh();
  }

  return (
    <div className="page">
      <div className="row">
        <div className="grow"><div className="eyebrow">Skills</div><h1 className="h-page">How your Bots get smarter</h1>
          <p className="muted">After real work, a Bot proposes a reusable skill — you decide whether it keeps it. Skills are plain <code>SKILL.md</code> files, compatible with Hermes Agent.</p></div>
        <button className="btn" onClick={() => setCreate(true)}><Plus size={16} />Write a skill</button>
      </div>
      <div className="tabsbar">
        <div className="seg">
          {(["proposed", "active", "disabled"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t === "proposed" ? "To review" : t === "active" ? "In use" : "Library"} {data.counts[t] ? <span className="faint">· {data.counts[t]}</span> : null}
            </button>
          ))}
        </div>
        <div className="row grow" style={{ justifyContent: "flex-end" }}>
          <div style={{ position: "relative", minWidth: 240 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 13 }} className="faint" />
            <input className="field" style={{ paddingLeft: 34 }} placeholder="Search skills" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {data.hermes_library && (
            <button className="btn" onClick={async () => { const r = await post("/api/skills/import-hermes"); toast(`Imported ${r.imported} skills from Hermes Agent`); setTab("disabled"); load(); }}>
              <Download size={15} />Import Hermes library</button>
          )}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
        {data.skills.map((s, i) => (
          <motion.div key={s.id} className="glass card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }}>
            <div className="row" style={{ gap: 8 }}>
              <b className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</b>
              <span className="pill">{s.source === "hermes" ? "Hermes" : s.source === "learned" ? "learned" : "yours"}</span>
            </div>
            <p className="small muted" style={{ minHeight: 40 }}>{s.description}</p>
            <div className="tiny">{s.category && `${s.category} · `}{s.bot_id ? `${botById(s.bot_id).name} · ` : ""}used {s.uses}× · {ago(s.updated_at)}</div>
            <div className="row" style={{ marginTop: 12 }}>
              {s.status !== "active" && <button className="btn sm mint" onClick={() => setStatus(s, "active")}>{s.status === "proposed" ? "Save skill" : "Turn on"}</button>}
              {s.status === "active" && <button className="btn sm" onClick={() => setStatus(s, "disabled")}>Turn off</button>}
              <button className="btn sm ghost" onClick={() => setView(s)}>View</button>
              {s.status === "proposed" && <button className="btn sm ghost" onClick={async () => { await del(`/api/skills/${s.id}`); load(); refresh(); }}>Dismiss</button>}
            </div>
          </motion.div>
        ))}
      </div>
      {!data.skills.length && <Empty icon="🎓">{tab === "proposed" ? "Nothing to review. Skills appear here after your Bots finish multi-step work." : tab === "active" ? "No skills in use yet." : data.hermes_library ? "Import the Hermes Agent skill library to browse hundreds of ready-made skills." : "No skills here."}</Empty>}
      <SkillView skill={view} onClose={() => setView(null)} onSaved={load} />
      <SkillCreate open={create} onClose={() => setCreate(false)} onSaved={load} />
    </div>
  );
}

function SkillView({ skill, onClose, onSaved }: { skill: Skill | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [body, setBody] = useState("");
  const [md, setMd] = useState("");
  useEffect(() => { if (skill) { setBody(skill.body); get(`/api/skills/${skill.id}/skill.md`).then((r) => setMd(r.content)); } }, [skill]);
  return (
    <Modal open={!!skill} onClose={onClose} wide label="Skill">
      {skill && <>
        <h2>{skill.name}</h2><p className="muted small">{skill.description}</p>
        <label className="label">Instructions (Markdown)</label>
        <textarea className="field mono" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="modal-actions">
          <button className="btn" onClick={() => { const blob = new Blob([md], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "SKILL.md"; a.click(); }}>Download SKILL.md</button>
          <span className="grow" />
          <button className="btn danger" onClick={async () => { if (confirm("Delete skill?")) { await del(`/api/skills/${skill.id}`); onSaved(); onClose(); } }}>Delete</button>
          <button className="btn primary" onClick={async () => { await patch(`/api/skills/${skill.id}`, { body }); toast("Saved"); onSaved(); onClose(); }}>Save</button>
        </div>
      </>}
    </Modal>
  );
}

function SkillCreate({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState({ name: "", description: "", body: "## When to use\n\n## Steps\n1. \n" });
  return (
    <Modal open={open} onClose={onClose} wide label="Write a skill">
      <h2>Write a skill</h2>
      <label className="label">Name</label><input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="weekly-budget-check" />
      <label className="label">When should Bots use it?</label><input className="field" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="When I ask how my spending is going this month" />
      <label className="label">Instructions</label><textarea className="field mono" rows={10} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => { try { await post("/api/skills", { ...f, status: "active" }); toast("Skill saved"); onSaved(); onClose(); } catch (e: any) { toast(e.message, true); } }}>Save</button></div>
    </Modal>
  );
}
