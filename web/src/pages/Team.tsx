import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BotOrb, stateOf } from "../components/BotOrb";
import { Modal, ToggleRow } from "../components/ui";
import { del, post, put, type Bot } from "../lib/api";
import { useApp } from "../lib/store";

const COLORS = ["#8b6cff", "#2fd4bf", "#ff8a66", "#ffc23d", "#ff6b98", "#5b7cff", "#34d399", "#e879f9"];
const ENGINES = [
  { id: "rewoo", name: "ReWoo", hint: "Built-in: private memory, receipts, consent, tools." },
  { id: "hermes", name: "Hermes Agent", hint: "Self-improving agent (Nous Research). Needs Hermes running — see Connections." },
  { id: "openclaw", name: "OpenClaw", hint: "Gateway agent with 20+ chat apps. Needs OpenClaw running — see Connections." },
];

export function Team() {
  const { bots } = useApp();
  const [edit, setEdit] = useState<Partial<Bot> | null>(null);
  const nav = useNavigate();
  return (
    <div className="page">
      <div className="row">
        <div className="grow"><div className="eyebrow">Team</div><h1 className="h-page">Your AI teammates</h1>
          <p className="muted">Each Bot has a job, a personality, a set of skills and a privacy level. They hand work to each other when it makes sense.</p></div>
        <button className="btn primary" onClick={() => setEdit({ name: "", color: COLORS[0], emoji: "✨", tools: [], engine: "rewoo", profile: "balanced" })}><Plus size={16} />New Bot</button>
      </div>
      <div className="grid bots-grid section">
        {bots.map((b, i) => (
          <motion.div key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <div className={`glass botcard ${b.activity?.live ? "live" : ""}`} style={{ ["--c" as any]: b.color, cursor: "default" }}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <BotOrb color={b.color} state={stateOf(b)} size={60} emoji={b.emoji} />
                <div className="grow"><div className="job">{b.job || "Teammate"}</div><h3>{b.name}</h3>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}><span className="pill">{b.engine}</span>{b.profile === "private" && <span className="pill priv">🔒 on-device only</span>}</div></div>
              </div>
              <p className="small muted" style={{ position: "relative", zIndex: 1 }}>{b.tagline}</p>
              <div className="row" style={{ position: "relative", zIndex: 1 }}>
                <button className="btn sm primary" onClick={() => { localStorage.setItem("rewoo-bot", b.id); nav("/"); }}>Message</button>
                <button className="btn sm" onClick={() => setEdit(b)}>{b.builtin ? "Customize" : "Edit"}</button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      <BotEditor bot={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function BotEditor({ bot, onClose }: { bot: Partial<Bot> | null; onClose: () => void }) {
  const { tools, refresh, toast } = useApp();
  const [f, setF] = useState<Partial<Bot>>({});
  const open = !!bot;
  useEffect(() => { if (bot) setF({ ...bot }); }, [bot]);
  const set = (k: keyof Bot, v: any) => setF((x) => ({ ...x, [k]: v }));
  const toolsSel = (f.tools as string[]) || [];

  async function save() {
    const body = { name: f.name, emoji: f.emoji, color: f.color, tagline: f.tagline || "", job: f.job || "", instructions: f.instructions || "",
      tools: toolsSel, profile: f.profile || "balanced", engine: f.engine || "rewoo", engine_config: f.engine_config || {} };
    try {
      if (!body.name?.trim()) throw new Error("Give your Bot a name");
      if (f.id) await put(`/api/bots/${f.id}`, body); else await post("/api/bots", body);
      await refresh();
      toast(`${body.name} is ready ✨`);
      onClose();
    } catch (e: any) { toast(e.message, true); }
  }

  return (
    <Modal open={open} onClose={onClose} wide label="Edit Bot">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <BotOrb color={f.color || COLORS[0]} state="done" size={72} emoji={f.emoji} />
        <div className="grow"><h2>{f.id ? `Edit ${f.name}` : "New Bot"}</h2><div className="muted small">Describe the job like you'd brief a new colleague.</div></div>
      </div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ width: 90 }}><label className="label">Emoji</label><input className="field" maxLength={4} value={f.emoji || ""} onChange={(e) => set("emoji", e.target.value)} /></div>
        <div className="grow"><label className="label">Name</label><input className="field" value={f.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Scout" /></div>
        <div className="grow"><label className="label">Job</label><input className="field" value={f.job || ""} onChange={(e) => set("job", e.target.value)} placeholder="e.g. Sales outbound" /></div>
      </div>
      <label className="label">One-line description</label>
      <input className="field" value={f.tagline || ""} onChange={(e) => set("tagline", e.target.value)} placeholder="Researches accounts and drafts outreach in my voice" />
      <label className="label">How should it work?</label>
      <textarea className="field" rows={3} value={f.instructions || ""} onChange={(e) => set("instructions", e.target.value)} placeholder="Be concise. Always check my notes first. Leave a review list for me to approve." />
      <label className="label">Colour</label>
      <div className="row">{COLORS.map((c) => <button key={c} onClick={() => set("color", c)} aria-label={c} style={{ width: 30, height: 30, borderRadius: 10, background: c, border: f.color === c ? "2px solid #fff" : "1px solid var(--line)", cursor: "pointer" }} />)}</div>
      <label className="label">Engine</label>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
        {ENGINES.map((e) => (
          <button key={e.id} className="preset" style={(f.engine || "rewoo") === e.id ? { borderColor: "var(--accent)", boxShadow: "var(--glow)" } : undefined} onClick={() => set("engine", e.id)}>
            <b>{e.name}</b><small>{e.hint}</small>
          </button>
        ))}
      </div>
      {(f.engine || "rewoo") === "rewoo" && (
        <>
          <label className="label">Skills it can use <span className="faint">(none selected = all)</span></label>
          <div>{tools.map((t) => (
            <label key={t.name} className="tag" style={{ cursor: "pointer", borderColor: toolsSel.includes(t.name) ? "var(--accent)" : undefined }}>
              <input type="checkbox" checked={toolsSel.includes(t.name)} onChange={(e) => set("tools", e.target.checked ? [...toolsSel, t.name] : toolsSel.filter((x) => x !== t.name))} style={{ display: "none" }} />
              {t.emoji} {t.label}{t.risk !== "safe" && <span className="faint"> · asks</span>}
            </label>
          ))}</div>
        </>
      )}
      <ToggleRow title="Private Bot 🔒" hint="Only uses brains running on this computer (e.g. Ollama)." checked={f.profile === "private"} onChange={(v) => set("profile", v ? "private" : "balanced")} />
      <div className="modal-actions">
        {f.id && !f.builtin && <button className="btn danger" onClick={async () => { if (confirm("Delete this Bot?")) { await del(`/api/bots/${f.id}`); await refresh(); onClose(); } }}>Delete</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}
