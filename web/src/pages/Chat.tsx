import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, ChevronDown, Copy as CopyIcon, MonitorPlay, PanelRightClose, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BotOrb } from "../components/BotOrb";
import { Composer } from "../components/Composer";
import { Modal, StatusPill } from "../components/ui";
import { del, get, patch, post, type Ev, type Task, type Thread, type Turn } from "../lib/api";
import { Markdown } from "../lib/md";
import { useApp } from "../lib/store";
import { applyEvent, LIVE, reduceTurn, type TurnView } from "../lib/turn";

type T = { task: Task; view: TurnView; lastSeq: number };

export function Chat() {
  const { id = "" } = useParams();
  const { botById, toast, refreshThreads } = useApp();
  const [thread, setThread] = useState<Thread | null>(null);
  const [turns, setTurns] = useState<T[]>([]);
  const [bot, setBot] = useState("woo");
  const [panel, setPanel] = useState(window.innerWidth > 1100);
  const [tab, setTab] = useState<"activity" | "context" | "usage">("activity");
  const [focus, setFocus] = useState<string | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [teach, setTeach] = useState<Task | null>(null);
  const streams = useRef<Record<string, EventSource>>({});
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const nav = useNavigate();

  const onEvent = useCallback((tid: string, ev: Ev) => {
    setTurns((ts) => ts.map((t) => (t.task.id !== tid || ev.seq <= t.lastSeq ? t : { ...t, view: applyEvent(t.view, ev), lastSeq: ev.seq,
      task: ["done", "error", "stopped", "cancelled"].includes(ev.type) ? { ...t.task, status: ev.type === "done" ? "done" : ev.type === "error" ? "failed" : ev.type } : t.task })));
  }, []);

  const follow = useCallback((tid: string, after: number) => {
    if (streams.current[tid]) return;
    const es = new EventSource(`/api/tasks/${tid}/stream?after=${after}`);
    streams.current[tid] = es;
    es.onmessage = (m) => onEvent(tid, JSON.parse(m.data));
    es.addEventListener("end", () => { es.close(); delete streams.current[tid]; refreshThreads(); });
    es.onerror = () => { /* EventSource auto-reconnects; the server replays from ?after */ };
  }, [onEvent, refreshThreads]);

  useEffect(() => {
    let alive = true;
    Object.values(streams.current).forEach((e) => e.close());
    streams.current = {};
    setTurns([]);
    get<{ thread: Thread; turns: Turn[] }>(`/api/threads/${id}`).then((d) => {
      if (!alive) return;
      setThread(d.thread);
      const last = d.turns[d.turns.length - 1];
      setBot(last?.helper_id || d.thread.bot_id || "woo");
      const ts = d.turns.map((t) => ({ task: t, view: reduceTurn(t.events, t.status), lastSeq: t.events.length ? t.events[t.events.length - 1].seq : 0 }));
      setTurns(ts);
      ts.filter((t) => LIVE.has(t.task.status)).forEach((t) => follow(t.task.id, t.lastSeq));
    }).catch(() => { toast("That conversation doesn't exist anymore", true); nav("/"); });
    return () => { alive = false; Object.values(streams.current).forEach((e) => e.close()); streams.current = {}; };
  }, [id, follow, nav, toast]);

  // keep scrolled to bottom while streaming, unless the user scrolled up
  useEffect(() => { if (stick.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [turns]);

  async function send(text: string, botId: string) {
    try {
      const r = await post<{ task: Task }>(`/api/threads/${id}/messages`, { message: text, bot_id: botId });
      stick.current = true;
      setTurns((ts) => [...ts, { task: r.task, view: reduceTurn([], "queued"), lastSeq: 0 }]);
      setFocus(r.task.id);
      follow(r.task.id, 0);
      refreshThreads();
    } catch (e: any) { toast(e.message, true); }
  }

  const current = useMemo(() => turns.find((t) => t.task.id === focus) || turns[turns.length - 1], [turns, focus]);
  const busy = turns.some((t) => LIVE.has(t.task.status));
  const cite = (tid: string) => (n: number) => { setFocus(tid); setPanel(true); setTab("context"); setFlash(n); setTimeout(() => setFlash(null), 1600); };

  return (
    <div className={`chat ${panel ? "" : "nopanel"}`}>
      <div className="chat-main">
        <header className="chat-head">
          <BotOrb color={botById(thread?.bot_id).color} size={28} state={busy ? "working" : "idle"} />
          <h1 className="grow">{thread?.title || "Conversation"}</h1>
          {thread && thread.origin !== "app" && <span className="pill">{thread.origin}</span>}
          <button className="btn ghost sm icon" title="Delete conversation" aria-label="Delete conversation"
            onClick={async () => { if (confirm("Delete this conversation?")) { await del(`/api/threads/${id}`); refreshThreads(); nav("/"); } }}><Trash2 size={15} /></button>
          <button className={`btn sm ${panel ? "" : "primary"}`} onClick={() => setPanel((p) => !p)} title="Show what the Bot is doing">
            {panel ? <PanelRightClose size={15} /> : <MonitorPlay size={15} />}<span className="hide-sm">{panel ? "Hide" : "Computer"}</span>
          </button>
        </header>
        <div className="chat-scroll" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
          <div className="chat-inner">
            {turns.map((t) => (
              <TurnBlock key={t.task.id} t={t} onCite={cite(t.task.id)} onFocus={() => setFocus(t.task.id)} focused={current?.task.id === t.task.id}
                onTeach={() => setTeach(t.task)} onRetry={() => send(t.task.prompt, t.task.helper_id)} />
            ))}
          </div>
        </div>
        <div className="chat-composer">
          <Composer botId={bot} onBot={setBot} onSend={send} busy={busy}
            onStop={() => turns.filter((t) => LIVE.has(t.task.status)).forEach((t) => post(`/api/tasks/${t.task.id}/cancel`))} />
        </div>
      </div>
      <Computer open={panel} turn={current} tab={tab} setTab={setTab} flash={flash} onClose={() => setPanel(false)} />
      <TeachModal task={teach} onClose={() => setTeach(null)} />
    </div>
  );
}

function TurnBlock({ t, onCite, onFocus, focused, onTeach, onRetry }:
  { t: T; onCite: (n: number) => void; onFocus: () => void; focused: boolean; onTeach: () => void; onRetry: () => void }) {
  const { botById, toast, refresh } = useApp();
  const v = t.view;
  const b = botById(t.task.helper_id);
  const live = LIVE.has(t.task.status);
  const [skillState, setSkillState] = useState<"new" | "saved" | "dismissed">("new");
  const visibleSteps = v.steps.filter((s) => s.kind !== "context" || s.depth === 0);
  const prompt = t.task.prompt.split("\n\nFollow the routine you were taught:")[0];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "contents" }}>
      <div className="msg-user">{prompt}</div>
      <div className="msg-bot" onClick={onFocus}>
        <BotOrb color={b.color} state={live ? v.mood : v.status === "failed" ? "oops" : "idle"} size={40} />
        <div style={{ minWidth: 0 }}>
          <div className="who">{b.name}<span className="faint small" style={{ fontWeight: 400 }}>{b.job}</span>
            {live && <span className="pill run"><span className="typing"><i /><i /><i /></span>{v.moodText}</span>}
            {!live && t.task.status !== "done" && <StatusPill status={t.task.status} />}
            {v.agents.filter((a) => a !== b.id).map((a) => <span key={a} className="handoff">🤝 {botById(a).name}</span>)}
          </div>

          {(visibleSteps.length > 0 || v.plan.length > 0) && (
            <details className="worklog" open={live}>
              <summary><ChevronDown size={14} />{live ? "Working…" : `Worked through ${v.usage.steps || visibleSteps.length} step${(v.usage.steps || 0) === 1 ? "" : "s"}`}
                <span className="grow" /><span className="tiny">{v.used.length ? `${v.used.length} memory item${v.used.length > 1 ? "s" : ""}` : ""}</span></summary>
              {v.plan.length > 0 && <div className="plan" style={{ paddingTop: 10 }}>{v.plan.map((p, i) => <span key={i} className={i < v.toolsDone || v.status === "done" ? "ok" : ""}>{i < v.toolsDone || v.status === "done" ? "✓ " : ""}{p}</span>)}</div>}
              <div className="steps">
                <AnimatePresence initial={false}>
                  {visibleSteps.map((s) => (
                    <motion.div key={s.key} className={`stp ${s.ok === false || s.kind === "warn" ? "warn" : s.ok ? "ok" : ""} ${s.depth ? "nested" : ""}`}
                      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}>
                      <span className="ic">{s.icon}</span>
                      <div><div>{s.depth ? <b>{botById(s.agent).name}: </b> : null}{s.title}</div>{s.detail && <div className="d">{s.detail}</div>}</div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </details>
          )}

          {v.approvals.filter((a) => !a.decided).map((a) => (
            <motion.div key={a.id} className="card-approve" initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <b>{a.emoji} {b.name} wants to {a.label ? a.label.toLowerCase() : a.tool}</b>
              <div className="tiny">{a.reason}</div>
              <pre>{Object.entries(a.input).map(([k, val]) => `${k}: ${val}`).join("\n")}</pre>
              <div className="row">
                <button className="btn mint sm" onClick={() => post(`/api/approvals/${a.id}`, { approve: true }).then(refresh).catch((e) => toast(e.message, true))}>Allow</button>
                <button className="btn sm" onClick={() => post(`/api/approvals/${a.id}`, { approve: false }).then(refresh).catch((e) => toast(e.message, true))}>Not now</button>
              </div>
            </motion.div>
          ))}

          {(v.answer || (!live && t.task.result)) && (
            <div className={`answer ${v.streaming ? "streaming" : ""}`}><Markdown text={v.answer || t.task.result || ""} onCite={onCite} /></div>
          )}
          {!live && v.error && !v.answer && <div className="leftout">😵 {v.error}</div>}
          {live && !v.answer && !visibleSteps.length && <div className="faint small"><span className="typing"><i /><i /><i /></span></div>}

          {v.skill && skillState === "new" && (
            <motion.div className="card-skill" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <b>🎓 I learned a way to do this faster next time</b>
              <div className="small muted" style={{ margin: "4px 0 10px" }}><b>{v.skill.name}</b> — {v.skill.description}</div>
              <div className="row">
                <button className="btn mint sm" onClick={async () => { await patch(`/api/skills/${v.skill!.id}`, { status: "active" }); setSkillState("saved"); toast("Skill saved — your Bots will use it"); refresh(); }}>Save skill</button>
                <button className="btn sm" onClick={async () => { await del(`/api/skills/${v.skill!.id}`); setSkillState("dismissed"); refresh(); }}>No thanks</button>
              </div>
            </motion.div>
          )}
          {skillState === "saved" && <div className="tiny" style={{ marginTop: 8 }}>🎓 Skill saved.</div>}

          {!live && t.task.status === "done" && (
            <div className="turn-actions">
              <button className="btn ghost sm" onClick={() => navigator.clipboard.writeText(v.answer || t.task.result || "").then(() => toast("Copied"))}><CopyIcon size={13} />Copy</button>
              <button className="btn ghost sm" onClick={onTeach} title="Save this as a routine your Bot can repeat on a schedule"><CalendarPlus size={13} />Save as routine</button>
              <button className="btn ghost sm" onClick={onRetry}><RotateCcw size={13} />Retry</button>
              {focused && <span className="tiny" style={{ alignSelf: "center" }}>{v.usage.tokens ? `${v.usage.tokens.toLocaleString()} tokens` : ""}</span>}
            </div>
          )}
          {!live && t.task.status !== "done" && t.task.status !== "queued" && (
            <div className="turn-actions"><button className="btn ghost sm" onClick={onRetry}><RotateCcw size={13} />Try again</button></div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Computer({ open, turn, tab, setTab, flash, onClose }:
  { open: boolean; turn?: T; tab: string; setTab: (t: any) => void; flash: number | null; onClose: () => void }) {
  const { botById } = useApp();
  const [openItem, setOpenItem] = useState<number | null>(null);
  useEffect(() => { if (flash != null) { setOpenItem(flash); document.getElementById(`ri-${flash}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); } }, [flash]);
  if (!turn) return <aside className={`computer ${open ? "open" : ""}`} />;
  const v = turn.view;
  const b = botById(turn.task.helper_id);
  const live = LIVE.has(turn.task.status);
  return (
    <aside className={`computer ${open ? "open" : ""}`} aria-label="What the Bot is doing">
      <div className="tabs">
        {(["activity", "context", "usage"] as const).map((k) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {k === "activity" ? "Computer" : k === "context" ? `Context${v.used.length ? ` · ${v.used.length}` : ""}` : "Usage"}
          </button>
        ))}
        <button className="btn ghost sm icon" onClick={onClose} aria-label="Close panel" style={{ flex: "none" }}><PanelRightClose size={14} /></button>
      </div>
      <div className="body">
        {tab === "activity" && (
          <>
            <div className="screen">
              {live && <div className="scan" />}
              <div className="row" style={{ position: "relative" }}>
                <BotOrb color={b.color} state={live ? v.mood : "idle"} size={56} emoji={b.emoji} />
                <div className="grow"><b>{b.name}</b><div className="tiny">{v.engine && v.engine !== "rewoo" ? `Engine: ${v.engine}` : v.brain ? `Brain: ${v.brain}` : ""}{v.onDevice ? " · on this device 🔒" : ""}</div></div>
              </div>
              <div className="now" style={{ marginTop: 14, position: "relative" }}>{live ? `> ${v.moodText}` : v.status === "done" ? "> finished" : `> ${v.status}`}</div>
            </div>
            {v.steps.slice(-14).map((s) => (
              <div key={s.key} className={`stp ${s.ok === false || s.kind === "warn" ? "warn" : ""}`}>
                <span className="ic">{s.icon}</span><div><div className="small">{s.title}</div>{s.detail && <div className="d">{s.detail}</div>}</div>
              </div>
            ))}
            {!v.steps.length && <div className="tiny">Steps will appear here as {b.name} works.</div>}
          </>
        )}
        {tab === "context" && (
          <>
            <div className="tiny">Everything from your memory that {b.name} was shown for this request — nothing else.</div>
            {v.used.map((it) => (
              <div key={`${it.n}-${it.title}`} id={`ri-${it.n}`} className={`ritem ${flash === it.n ? "flash" : ""} ${openItem === it.n ? "open" : ""}`} onClick={() => setOpenItem(openItem === it.n ? null : it.n)}>
                <div className="top"><span className="n">{it.n}</span><span>{it.kind === "fact" ? "💡" : it.kind === "episode" ? "💬" : "📄"}</span>
                  <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>{it.private && <span className="pill priv">🔒</span>}</div>
                <div className="src">{it.source}{it.why?.length ? ` · ${it.why.join(", ")}` : ""}{it.url && <> · <a href={it.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>open</a></>}</div>
                <div className="snip">{it.text}</div>
              </div>
            ))}
            {!v.used.length && <div className="leftout">Nothing from your memory was needed.</div>}
            {v.leftOut.length > 0 && <div className="tiny" style={{ marginTop: 6 }}>Left out on purpose</div>}
            {v.leftOut.map((x, i) => <div key={i} className="leftout"><b>{x.title}</b> — {x.reason}</div>)}
            {v.secrets > 0 && <div className="leftout">🔐 Hid {v.secrets} secret{v.secrets > 1 ? "s" : ""} (passwords, keys) before anything left this computer.</div>}
          </>
        )}
        {tab === "usage" && (
          <>
            <div className="stats"><div><b>{v.usage.steps}</b><small>steps</small></div><div><b>{v.usage.tokens.toLocaleString()}</b><small>tokens</small></div>
              <div><b>${v.usage.cost.toFixed(v.usage.cost < 0.01 ? 4 : 2)}</b><small>cost</small></div></div>
            <div className="meter"><i style={{ width: `${Math.min(100, (v.usage.steps / 8) * 100)}%` }} /></div>
            <div className="tiny">Brain: {v.usage.brain || v.brain || "—"} {v.usage.model ? `(${v.usage.model})` : ""}</div>
            <div className="tiny">Limits live in Settings → Limits. Your Bot stops politely when it hits one.</div>
          </>
        )}
      </div>
    </aside>
  );
}

function TeachModal({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { toast } = useApp();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"manual" | "daily" | "interval">("daily");
  const [time, setTime] = useState("09:00");
  useEffect(() => { if (task) setName(task.title); }, [task]);
  return (
    <Modal open={!!task} onClose={onClose} label="Save as routine">
      <h2>Teach this as a routine</h2>
      <p className="muted small">Your Bot remembers the steps it just took and repeats them — on a schedule or whenever you press Run.</p>
      <label className="label">Name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="label">When</label>
      <div className="seg">
        {(["daily", "interval", "manual"] as const).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k === "daily" ? "Every day" : k === "interval" ? "Every hour" : "Only when I press Run"}</button>)}
      </div>
      {kind === "daily" && <><label className="label">At</label><input className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ maxWidth: 160 }} /></>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={async () => {
          try {
            const schedule = kind === "daily" ? { kind, time } : kind === "interval" ? { kind, minutes: 60 } : { kind };
            await post(`/api/routines/from-task/${task!.id}`, { name, schedule });
            toast("Routine saved");
            onClose();
            nav("/routines");
          } catch (e: any) { toast(e.message, true); }
        }}>Save routine</button>
      </div>
    </Modal>
  );
}
