import { motion } from "framer-motion";
import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BotOrb } from "../components/BotOrb";
import { Copy, Modal, Switch } from "../components/ui";
import { del, get, patch, post, put } from "../lib/api";
import { useApp } from "../lib/store";

export function Connections() {
  const [tab, setTab] = useState<"channels" | "engines" | "api">("channels");
  return (
    <div className="page">
      <div className="eyebrow">Connections</div>
      <h1 className="h-page">Works where you work</h1>
      <p className="muted">Talk to your Bots from chat apps, power them with other agent engines, or let other software use them.</p>
      <div className="tabsbar"><div className="seg">
        <button className={tab === "channels" ? "on" : ""} onClick={() => setTab("channels")}>Chat apps</button>
        <button className={tab === "engines" ? "on" : ""} onClick={() => setTab("engines")}>Engines</button>
        <button className={tab === "api" ? "on" : ""} onClick={() => setTab("api")}>API</button>
      </div></div>
      {tab === "channels" && <Channels />}
      {tab === "engines" && <Engines />}
      {tab === "api" && <ApiAccess />}
    </div>
  );
}

function Channels() {
  const { bots, toast } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: "Telegram", token: "", default_bot: "woo" });
  const load = useCallback(() => get("/api/channels").then((r) => setRows(r.channels)), []);
  useEffect(() => { load().catch(() => {}); const t = setInterval(() => load().catch(() => {}), 5000); return () => clearInterval(t); }, [load]);
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))" }}>
        {rows.map((c) => (
          <motion.div key={c.id} className="glass card col" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="row"><span style={{ fontSize: 26 }}>✈️</span><div className="grow"><b>{c.name}</b><div className="tiny">@{c.config.bot_username || "…"} · {c.status}{c.last_error ? ` — ${c.last_error}` : ""}</div></div>
              <Switch checked={c.enabled} onChange={async (v) => { await post(`/api/channels/${c.id}/enabled`, { enabled: v }); load(); }} label="Enabled" /></div>
            <div className="small muted">Pair a chat by sending this to your bot in Telegram:</div>
            <div className="row"><span className="pair-code">/start {c.config.pair_code}</span>
              <button className="btn sm ghost icon" title="New code" onClick={async () => { await patch(`/api/channels/${c.id}`, { rotate_code: true }); load(); }}><RefreshCw size={14} /></button></div>
            <div className="tiny">{(c.config.allowed_chats || []).length} paired chat(s) · answers as {bots.find((b) => b.id === c.config.default_bot)?.name || c.config.default_bot} · change per chat with /bot &lt;id&gt;</div>
            <div className="row">
              <select className="field" style={{ maxWidth: 200, height: 34 }} value={c.config.default_bot} onChange={async (e) => { await patch(`/api/channels/${c.id}`, { default_bot: e.target.value }); load(); }}>
                {bots.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}</select>
              <button className="btn sm ghost" onClick={async () => { await patch(`/api/channels/${c.id}`, { unpair_all: true }); toast("All chats unpaired"); load(); }}>Unpair all</button>
              <button className="btn sm ghost danger" onClick={async () => { if (confirm("Remove this channel?")) { await del(`/api/channels/${c.id}`); load(); } }}>Remove</button>
            </div>
          </motion.div>
        ))}
        <button className="glass card col" style={{ alignItems: "center", justifyContent: "center", minHeight: 180, cursor: "pointer", color: "inherit" }} onClick={() => setAdd(true)}>
          <Plus size={22} /><b>Connect Telegram</b><span className="tiny">Built in — no extra software needed</span>
        </button>
      </div>
      <div className="soft card section small muted">
        <b>WhatsApp, Slack, Discord, Signal, iMessage and 20+ more?</b> Run the bundled <b>OpenClaw</b> gateway (see <i>Engines</i>) and add ReWoo as its model provider — every message reaches your ReWoo Bots with memory and consent intact.
      </div>
      <Modal open={add} onClose={() => setAdd(false)} label="Connect Telegram">
        <h2>Connect Telegram</h2>
        <ol className="small muted" style={{ paddingLeft: 18 }}>
          <li>In Telegram, message <b>@BotFather</b> → <code>/newbot</code> → copy the token.</li>
          <li>Paste it below. ReWoo connects over HTTPS — nothing to host.</li>
          <li>Send <code>/start &lt;code&gt;</code> to your new bot to pair your chat.</li>
        </ol>
        <label className="label">Bot token</label><input className="field mono" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} placeholder="123456:ABC-DEF…" />
        <label className="label">Who answers by default</label>
        <select className="field" value={f.default_bot} onChange={(e) => setF({ ...f, default_bot: e.target.value })}>{bots.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}</select>
        <div className="modal-actions"><button className="btn" onClick={() => setAdd(false)}>Cancel</button>
          <button className="btn primary" onClick={async () => { try { await post("/api/channels/telegram", f); toast("Telegram connected"); setAdd(false); setF({ ...f, token: "" }); load(); } catch (e: any) { toast(e.message, true); } }}>Connect</button></div>
      </Modal>
    </>
  );
}

const FIELDS: Record<string, [string, string, string?][]> = {
  hermes: [["mode", "Mode (api or cli)"], ["base_url", "API server URL"], ["api_key", "API_SERVER_KEY", "password"], ["model", "Model name"], ["cli", "CLI command (cli mode)"]],
  openclaw: [["base_url", "Gateway URL (…/v1)"], ["token", "Gateway token", "password"], ["agent", "Agent id"]],
  paperclip: [["base_url", "Paperclip URL"], ["api_key", "API key", "password"], ["company_id", "Company id"], ["webhook_secret", "Webhook secret (for its http adapter)", "password"]],
};

function Engines() {
  const { toast } = useApp();
  const [data, setData] = useState<any>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const load = useCallback(() => get("/api/engines").then(setData), []);
  useEffect(() => { load().catch(() => {}); }, [load]);
  if (!data) return <div className="tiny">Checking engines…</div>;
  const colors: Record<string, string> = { rewoo: "#8b6cff", hermes: "#ffc23d", openclaw: "#ff6b4a", paperclip: "#2fd4bf" };
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))" }}>
        {data.engines.map((e: any) => (
          <div key={e.id} className="glass engine">
            <div className="row"><BotOrb color={colors[e.id]} state={e.ok ? "idle" : "oops"} size={42} />
              <div className="grow"><b>{e.name}</b><div className="tiny">{e.kind === "orchestrator" ? "Orchestrator" : "Agent engine"} · {e.license}</div></div>
              <span className={`pill ${e.ok ? "ok" : "bad"}`}>{e.ok ? "Connected" : "Offline"}</span></div>
            <div className="small muted">{e.tagline}</div>
            <div className="tiny">{e.detail}</div>
            {e.vendored?.present && <div className="tiny">📦 Full source included: <code>engines/{e.id === "hermes" ? "hermes-agent" : e.id}</code></div>}
            {e.id !== "rewoo" && <div className="row">
              <button className="btn sm" onClick={() => { setEdit(e.id); setVals(Object.fromEntries(Object.entries(e.config).filter(([k]) => !k.endsWith("_set")).map(([k, v]) => [k, String(v ?? "")]))); }}>Configure</button>
              {e.upstream && <a className="btn sm ghost" href={e.upstream} target="_blank" rel="noopener noreferrer">Project ↗</a>}
            </div>}
          </div>
        ))}
      </div>
      <div className="section">
        <div className="head"><h2>Wire them together</h2><span className="tiny">Copy-paste configs</span></div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))" }}>
          {[["OpenClaw → uses ReWoo Bots", "openclaw"], ["Hermes → uses ReWoo Bots", "hermes"], ["Paperclip → hires a ReWoo Bot", "paperclip"]].map(([t, k]) => (
            <div key={k} className="soft card"><b className="small">{t}</b><div className="snippet" style={{ marginTop: 8 }}><pre>{data.snippets[k]}</pre><Copy text={data.snippets[k]} /></div></div>
          ))}
        </div>
        <p className="tiny">Full step-by-step guide: <code>docs/ENGINES.md</code>. Engines run separately (Node 24+ for OpenClaw & Paperclip, Python 3.11+ for Hermes); <code>docker compose --profile engines up</code> starts them all.</p>
      </div>
      <PaperclipBoard ok={data.engines.find((e: any) => e.id === "paperclip")?.ok} />
      <Modal open={!!edit} onClose={() => setEdit(null)} label="Configure engine">
        <h2>Configure {data.engines.find((e: any) => e.id === edit)?.name}</h2>
        {(FIELDS[edit || ""] || []).map(([k, label, type]) => (
          <div key={k}><label className="label">{label}</label>
            <input className="field" type={type || "text"} value={vals[k] || ""} placeholder={type === "password" ? (data.engines.find((e: any) => e.id === edit)?.config[`${k}_set`] ? "•••••• saved — leave blank to keep" : "") : ""} onChange={(ev) => setVals({ ...vals, [k]: ev.target.value })} /></div>
        ))}
        <div className="modal-actions"><button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn primary" onClick={async () => { const r = await put(`/api/engines/${edit}`, vals); toast(r.ok ? "Connected ✨" : `Saved — ${r.detail}`, !r.ok); setEdit(null); load(); }}>Save & test</button></div>
      </Modal>
    </>
  );
}

function PaperclipBoard({ ok }: { ok?: boolean }) {
  const { toast } = useApp();
  const [agents, setAgents] = useState<any[] | null>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  useEffect(() => {
    if (!ok) return;
    get("/api/paperclip/agents").then((r) => setAgents(r.agents)).catch(() => setAgents(null));
    get("/api/paperclip/issues").then((r) => setIssues(r.issues)).catch(() => {});
  }, [ok]);
  if (!ok) return null;
  return (
    <div className="section">
      <div className="head"><h2>📎 Your Paperclip company</h2></div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="soft card"><b>Agents</b>{(agents || []).map((a) => <div key={a.id} className="row small" style={{ marginTop: 6 }}><span className="grow">{a.name || a.id}</span><span className="tiny">{a.role || a.adapterType || ""}</span>
          <button className="btn sm ghost" onClick={() => post(`/api/paperclip/agents/${a.id}/wake`).then(() => toast("Woken"), (e) => toast(e.message, true))}>Wake</button></div>)}
          {agents === null && <div className="tiny">Set the company id in Configure to list agents.</div>}</div>
        <div className="soft card"><b>Issues</b>
          <form className="row" style={{ marginTop: 8 }} onSubmit={async (e) => { e.preventDefault(); try { const it = await post("/api/paperclip/issues", { title, assignee_agent_id: assignee || undefined }); setIssues([it, ...issues]); setTitle(""); toast("Issue created in Paperclip"); } catch (err: any) { toast(err.message, true); } }}>
            <input className="field grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New issue title" />
            <select className="field" style={{ maxWidth: 170 }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>{(agents || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <button className="btn sm">Create</button></form>
          {issues.slice(0, 8).map((c) => <div key={c.id} className="small" style={{ marginTop: 6 }}>• {c.title || c.id} <span className="tiny">{c.status || ""}</span></div>)}
          {!issues.length && <div className="tiny" style={{ marginTop: 6 }}>No issues yet.</div>}</div>
      </div>
    </div>
  );
}

function ApiAccess() {
  const { toast } = useApp();
  const [k, setK] = useState<{ api_key: string; base_url: string } | null>(null);
  const [show, setShow] = useState(false);
  const [snip, setSnip] = useState("");
  useEffect(() => { get("/api/settings/api-key").then(setK); get("/api/engines").then((d) => setSnip(d.snippets.curl)); }, []);
  if (!k) return null;
  return (
    <div className="glass card col" style={{ maxWidth: 820 }}>
      <b>OpenAI-compatible endpoint</b>
      <p className="small muted" style={{ margin: 0 }}>Any app that speaks the OpenAI API can use your Bots (with memory, receipts and approvals). Model names: <code>rewoo</code>, <code>rewoo/scout</code>, <code>rewoo/quill</code>…</p>
      <label className="label">Base URL</label><div className="row"><input className="field mono grow" readOnly value={k.base_url} /><Copy text={k.base_url} /></div>
      <label className="label">API key</label>
      <div className="row"><input className="field mono grow" readOnly value={show ? k.api_key : "rw-" + "•".repeat(28)} />
        <button className="btn sm" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button><Copy text={k.api_key} />
        <button className="btn sm ghost" onClick={async () => { if (confirm("Rotate the key? Apps using the old key stop working.")) { setK(await post("/api/settings/api-key/rotate")); toast("New key created"); } }}>Rotate</button></div>
      <div className="snippet" style={{ marginTop: 10 }}><pre>{snip}</pre><Copy text={snip} /></div>
    </div>
  );
}
