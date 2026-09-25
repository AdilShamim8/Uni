import { motion } from "framer-motion";
import { Play, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BotOrb } from "../components/BotOrb";
import { Empty, Modal, Switch } from "../components/ui";
import { ago, del, get, patch, post, until, type Routine } from "../lib/api";
import { useApp } from "../lib/store";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function Routines() {
  const { botById, toast, lastEvent } = useApp();
  const [rows, setRows] = useState<Routine[]>([]);
  const [edit, setEdit] = useState<Partial<Routine> | null>(null);
  const nav = useNavigate();
  const load = useCallback(() => get<{ routines: Routine[] }>("/api/routines").then((r) => setRows(r.routines)), []);
  useEffect(() => { load().catch(() => {}); }, [load, lastEvent?.type === "done" ? lastEvent.seq : 0]);

  return (
    <div className="page">
      <div className="row">
        <div className="grow"><div className="eyebrow">Routines</div><h1 className="h-page">Work that runs itself</h1>
          <p className="muted">A routine is a job your Bot repeats on a schedule — a morning brief, a weekly budget check. Teach one by pressing <b>Save as routine</b> under any finished answer.</p></div>
        <button className="btn primary" onClick={() => setEdit({ bot_id: "woo", name: "", prompt: "", steps: [], schedule: { kind: "daily", time: "09:00", days: DAYS } })}><Plus size={16} />New routine</button>
      </div>
      <div className="list section">
        {rows.map((r, i) => {
          const b = botById(r.bot_id);
          return (
            <motion.div key={r.id} className="glass item" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <BotOrb color={b.color} size={42} state={r.enabled ? "idle" : "idle"} emoji={b.emoji} />
              <div className="grow">
                <div className="row" style={{ gap: 8 }}><b>{r.name}</b><span className="pill">{r.schedule_text}</span>{r.steps.length > 0 && <span className="pill ok">taught · {r.steps.length} steps</span>}</div>
                <div className="small muted" style={{ marginTop: 4 }}>{r.prompt}</div>
                <div className="tiny" style={{ marginTop: 6 }}>{b.name} · ran {r.runs}× {r.last_run ? `· last ${ago(r.last_run)}` : ""} {r.enabled && r.next_run ? `· next ${until(r.next_run)}` : ""}
                  {r.last_task_id && <> · <a onClick={async () => { const t = await get(`/api/tasks/${r.last_task_id}`); nav(`/chat/${t.task.thread_id}`); }} style={{ cursor: "pointer" }}>last result</a></>}</div>
              </div>
              <Switch checked={r.enabled} onChange={async (v) => { await patch(`/api/routines/${r.id}`, { enabled: v }); load(); }} label="Enabled" />
              <button className="btn sm" onClick={async () => { const t = await post(`/api/routines/${r.id}/run`); toast("Running now"); nav(`/chat/${t.thread_id}`); }}><Play size={13} />Run</button>
              <button className="btn sm ghost" onClick={() => setEdit(r)}>Edit</button>
              <button className="btn sm ghost icon" aria-label="Delete" onClick={async () => { if (confirm("Delete routine?")) { await del(`/api/routines/${r.id}`); load(); } }}><Trash2 size={14} /></button>
            </motion.div>
          );
        })}
        {!rows.length && <Empty icon="⟳">No routines yet. Ask a Bot for something, then press <b>Save as routine</b> — or <Link to="#" onClick={(e) => { e.preventDefault(); setEdit({ bot_id: "woo", prompt: "", steps: [], schedule: { kind: "daily", time: "09:00" } }); }}>create one</Link>.</Empty>}
      </div>
      <RoutineEditor r={edit} onClose={() => setEdit(null)} onSaved={load} />
    </div>
  );
}

function RoutineEditor({ r, onClose, onSaved }: { r: Partial<Routine> | null; onClose: () => void; onSaved: () => void }) {
  const { bots, toast } = useApp();
  const [f, setF] = useState<Partial<Routine>>({});
  const [newStep, setNewStep] = useState("");
  useEffect(() => { if (r) setF(JSON.parse(JSON.stringify(r))); }, [r]);
  const s = f.schedule || { kind: "manual" };
  const setS = (x: any) => setF({ ...f, schedule: { ...s, ...x } });
  const steps = f.steps || [];

  async function save() {
    try {
      const body = { bot_id: f.bot_id, name: f.name, prompt: f.prompt, steps, schedule: s };
      if (f.id) await patch(`/api/routines/${f.id}`, body); else await post("/api/routines", { ...body, enabled: true });
      toast("Routine saved");
      onSaved();
      onClose();
    } catch (e: any) { toast(e.message, true); }
  }

  return (
    <Modal open={!!r} onClose={onClose} wide label="Routine">
      <h2>{f.id ? "Edit routine" : "New routine"}</h2>
      <div className="row">
        <div className="grow"><label className="label">Name</label><input className="field" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Morning brief" /></div>
        <div style={{ minWidth: 200 }}><label className="label">Who does it</label>
          <select className="field" value={f.bot_id} onChange={(e) => setF({ ...f, bot_id: e.target.value })}>{bots.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}</select></div>
      </div>
      <label className="label">What should it do?</label>
      <textarea className="field" rows={3} value={f.prompt || ""} onChange={(e) => setF({ ...f, prompt: e.target.value })} placeholder="Check my notes for anything due this week and give me a 5-bullet brief." />
      <label className="label">Steps it was taught <span className="faint">(optional — it follows these in order)</span></label>
      <div className="steps-edit">
        {steps.map((st, i) => (
          <div className="row" key={i}><span className="faint">{i + 1}.</span><input className="field" value={st} onChange={(e) => setF({ ...f, steps: steps.map((x, j) => (j === i ? e.target.value : x)) })} />
            <button className="btn sm ghost icon" onClick={() => setF({ ...f, steps: steps.filter((_, j) => j !== i) })} aria-label="Remove step">✕</button></div>
        ))}
        <div className="row"><input className="field" value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Add a step…"
          onKeyDown={(e) => { if (e.key === "Enter" && newStep.trim()) { setF({ ...f, steps: [...steps, newStep.trim()] }); setNewStep(""); } }} />
          <button className="btn sm" onClick={() => { if (newStep.trim()) { setF({ ...f, steps: [...steps, newStep.trim()] }); setNewStep(""); } }}>Add</button></div>
      </div>
      <label className="label">Schedule</label>
      <div className="seg">
        {[["daily", "At a time"], ["interval", "Every…"], ["manual", "Only manually"]].map(([k, l]) => (
          <button key={k} className={s.kind === k ? "on" : ""} onClick={() => setF({ ...f, schedule: k === "daily" ? { kind: "daily", time: "09:00", days: DAYS } : k === "interval" ? { kind: "interval", minutes: 60 } : { kind: "manual" } })}>{l}</button>
        ))}
      </div>
      {s.kind === "daily" && (
        <div className="row" style={{ marginTop: 12 }}>
          <input className="field" type="time" value={s.time || "09:00"} onChange={(e) => setS({ time: e.target.value })} style={{ maxWidth: 150 }} />
          <div className="daychips">{DAYS.map((d) => {
            const on = (s.days || DAYS).includes(d);
            return <button key={d} className={on ? "on" : ""} onClick={() => { const cur = s.days || DAYS; setS({ days: on ? cur.filter((x: string) => x !== d) : [...cur, d] }); }}>{d.slice(0, 2)}</button>;
          })}</div>
        </div>
      )}
      {s.kind === "interval" && (
        <div className="row" style={{ marginTop: 12 }}><span className="muted">Every</span>
          <select className="field" style={{ maxWidth: 200 }} value={s.minutes} onChange={(e) => setS({ minutes: Number(e.target.value) })}>
            {[15, 30, 60, 120, 240, 720, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>)}
          </select></div>
      )}
      <div className="help">Routine runs use the same limits and approvals as any task. Risky steps wait for you.</div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save routine</button></div>
    </Modal>
  );
}
