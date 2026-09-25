import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Modal, Switch, ToggleRow } from "../components/ui";
import { del, get, post, put } from "../lib/api";
import { useApp } from "../lib/store";

const MODES: Record<string, [string, string]> = {
  cautious: ["Careful", "Asks before remembering things or going online."],
  balanced: ["Balanced", "Asks before changing what Bots remember about you."],
  autopilot: ["Autopilot", "Only asks before things that can't be undone."],
};

export function SettingsPage() {
  const { toast, refresh, theme, setTheme } = useApp();
  const [s, setS] = useState<any>(null);
  const [p, setP] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const load = useCallback(async () => { const [a, b] = await Promise.all([get("/api/settings"), get("/api/providers")]); setS(a); setP(b); }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);
  if (!s || !p) return <div className="page tiny">Loading…</div>;
  const save = async (body: any, msg = "Saved") => { setS(await put("/api/settings", body)); toast(msg); refresh(); };

  return (
    <div className="page">
      <div className="eyebrow">Settings</div>
      <h1 className="h-page">Make ReWoo yours</h1>

      <section className="section"><div className="head"><h2>You</h2></div>
        <div className="glass card row">
          <input className="field grow" defaultValue={s.user_name} id="uname" placeholder="What should your Bots call you?" />
          <button className="btn" onClick={() => save({ user_name: (document.getElementById("uname") as HTMLInputElement).value.trim() }, "Nice to meet you 👋")}>Save</button>
          <div className="seg"><button className={theme === "night" ? "on" : ""} onClick={() => setTheme("night")}>Night</button><button className={theme === "day" ? "on" : ""} onClick={() => setTheme("day")}>Day</button></div>
        </div>
      </section>

      <section className="section"><div className="head"><h2>🧠 Brains</h2><span className="tiny">The AI models your team thinks with — mix and match, never locked in</span></div>
        <div className="list">
          {p.providers.map((x: any) => (
            <div key={x.id} className={`glass provider ${x.is_default ? "main" : ""}`}>
              <span style={{ fontSize: 22 }}>{x.type === "demo" ? "🧪" : x.local ? "💻" : "☁️"}</span>
              <div className="grow"><b>{x.name || x.id}</b> {x.is_default && <span className="pill run">main</span>} {x.local && <span className="pill priv">on this computer</span>}
                <div className="tiny">{x.model}{x.has_key ? ` · key ${x.key_hint}` : ""}{x.base_url ? ` · ${x.base_url}` : ""}</div></div>
              {!x.is_default && <label className="tiny row" style={{ gap: 6 }}><Switch checked={s.fallbacks.includes(x.id)} onChange={(v) => save({ fallbacks: v ? [...s.fallbacks, x.id] : s.fallbacks.filter((f: string) => f !== x.id) }, v ? "Added as backup" : "Removed backup")} />backup</label>}
              <button className="btn sm ghost" onClick={async () => { const r = await post(`/api/providers/${x.id}/test`); toast(r.ok ? `Works — ${r.detail}` : `Didn't work: ${r.detail}`, !r.ok); }}>Test</button>
              {!x.is_default && <button className="btn sm" onClick={() => save({ default_provider: x.id, fallbacks: s.fallbacks.filter((f: string) => f !== x.id) }, `${x.name} is now the main brain`)}>Make main</button>}
              {x.type !== "demo" && <><button className="btn sm ghost" onClick={() => setForm({ ...x, api_key: "" })}>Edit</button>
                <button className="btn sm ghost icon" aria-label="Remove" onClick={async () => { if (confirm("Remove this brain?")) { await del(`/api/providers/${x.id}`); load(); refresh(); } }}><Trash2 size={14} /></button></>}
            </div>
          ))}
        </div>
        <div className="soft card" style={{ marginTop: 12 }}><b className="small">Add a brain</b>
          <div className="grid presets" style={{ marginTop: 10 }}>
            {p.presets.map((x: any) => <button key={x.id} className="preset" onClick={() => setForm({ ...x, api_key: "", main: true })}>{x.local ? "💻" : "☁️"} <b>{x.name}</b><small>{x.local ? "Free · private · runs locally" : "Needs an API key"}</small></button>)}
            <button className="preset" onClick={() => setForm({ id: "custom", type: "openai_compat", name: "My server", base_url: "http://localhost:8000/v1", model: "", main: true })}>🔌 <b>Other</b><small>Any OpenAI-compatible server</small></button>
          </div></div>
      </section>

      <section className="section"><div className="head"><h2>🛡️ When should Bots ask first?</h2></div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          {Object.entries(MODES).map(([k, [t, d]]) => (
            <button key={k} className="preset" style={s.approval_mode === k ? { borderColor: "var(--accent)", boxShadow: "var(--glow)" } : undefined} onClick={() => save({ approval_mode: k })}>
              <b>{t}</b><small>{d}</small></button>
          ))}
        </div>
        <div className="glass card" style={{ marginTop: 12 }}>
          <ToggleRow title="Learn skills from experience" hint="After multi-step work, Bots propose a reusable skill for you to approve." checked={s.learning !== "off"} onChange={(v) => save({ learning: v ? "ask" : "off" })} />
          <ToggleRow title="Let apps using the API ask for approval" hint="Off = anything needing approval is declined automatically for API calls." checked={s.api_approval !== "deny"} onChange={(v) => save({ api_approval: v ? "ask" : "deny" })} />
        </div>
      </section>

      <section className="section"><div className="head"><h2>💸 Limits per task</h2><span className="tiny">Bots stop politely when they hit one</span></div>
        <div className="glass card">
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
            {[["max_steps", "Max steps", 1], ["max_tokens", "Max tokens", 1000], ["max_cost_usd", "Max cost (USD)", 0.05]].map(([k, l, step]) => (
              <div key={k as string}><label className="label">{l}</label><input className="field" type="number" step={step as number} defaultValue={s.budgets[k as string]} id={`b-${k}`} /></div>
            ))}
            <div><label className="label">Memory per task (tokens)</label><input className="field" type="number" step={100} defaultValue={s.context_tokens} id="b-ctx" /></div>
          </div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => {
            const v = (id: string) => Number((document.getElementById(id) as HTMLInputElement).value);
            save({ budgets: { max_steps: v("b-max_steps"), max_tokens: v("b-max_tokens"), max_cost_usd: v("b-max_cost_usd") }, context_tokens: v("b-ctx") }, "Limits saved");
          }}>Save limits</button>
        </div>
      </section>

      <section className="section"><div className="soft card small muted">
        ReWoo {"v"}{p && "0.2"} · open source (Apache-2.0) by <a href="https://adilshamim.me" target="_blank" rel="noopener noreferrer">Adil Shamim</a>. Your data lives in one file on this computer (<code>data/rewoo.db</code>). Costs are estimates and only appear if you enter prices for a brain.
      </div></section>
      <ProviderForm form={form} onClose={() => setForm(null)} onSaved={() => { load(); refresh(); }} />
    </div>
  );
}

function ProviderForm({ form, onClose, onSaved }: { form: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<any>({});
  useEffect(() => { if (form) setF(form); }, [form]);
  const needsKey = form && !form.local && form.type !== "ollama";
  return (
    <Modal open={!!form} onClose={onClose} label="Brain">
      {form && <>
        <h2>{form.has_key !== undefined ? "Edit" : "Add"} {form.name}</h2>
        <p className="muted small">{form.local ? "Runs on your computer — free and private. Make sure the app (e.g. Ollama) is running." : "Your key is stored only in your local ReWoo database."}</p>
        <label className="label">Name</label><input className="field" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
        {needsKey && <><label className="label">API key</label><input className="field" type="password" value={f.api_key || ""} placeholder={form.has_key ? "Leave blank to keep the saved key" : "Paste your key"} onChange={(e) => setF({ ...f, api_key: e.target.value })} /></>}
        <label className="label">Model</label><input className="field" value={f.model || ""} onChange={(e) => setF({ ...f, model: e.target.value })} />
        {(f.type === "openai_compat" || f.type === "ollama") && <><label className="label">Server address</label><input className="field" value={f.base_url || ""} onChange={(e) => setF({ ...f, base_url: e.target.value })} /></>}
        <details style={{ marginTop: 12 }}><summary className="small" style={{ cursor: "pointer" }}>More options</summary>
          <label className="label">Embedding model (optional — smarter memory search)</label><input className="field" value={f.embed_model || ""} onChange={(e) => setF({ ...f, embed_model: e.target.value })} />
          <div className="row"><div className="grow"><label className="label">$ / 1M input tokens</label><input className="field" type="number" step="0.01" value={f.price_in || 0} onChange={(e) => setF({ ...f, price_in: Number(e.target.value) })} /></div>
            <div className="grow"><label className="label">$ / 1M output tokens</label><input className="field" type="number" step="0.01" value={f.price_out || 0} onChange={(e) => setF({ ...f, price_out: Number(e.target.value) })} /></div></div>
          <ToggleRow title="Runs on this computer" hint="Allowed to see private memory" checked={!!f.local} onChange={(v) => setF({ ...f, local: v })} />
        </details>
        <ToggleRow title="Make this the main brain" checked={!!f.main} onChange={(v) => setF({ ...f, main: v })} />
        <div className="modal-actions"><button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={async () => {
            try {
              const body = { id: f.id, type: f.type, name: f.name, model: f.model || "", base_url: f.base_url || "", embed_model: f.embed_model || "", local: !!f.local,
                price_in: f.price_in || 0, price_out: f.price_out || 0, ...(needsKey ? { api_key: f.api_key || "" } : {}) };
              await post("/api/providers", body);
              if (f.main) await put("/api/settings", { default_provider: f.id });
              onClose();
              const r = await post(`/api/providers/${f.id}/test`);
              toast(r.ok ? `🎉 ${f.name} is connected` : `Saved, but the test failed: ${r.detail}`, !r.ok);
              onSaved();
            } catch (e: any) { toast(e.message, true); }
          }}>Save & test</button></div>
      </>}
    </Modal>
  );
}
