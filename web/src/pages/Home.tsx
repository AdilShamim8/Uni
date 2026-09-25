import { motion } from "framer-motion";
import { ArrowRight, GraduationCap, Hand } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BotOrb, stateOf } from "../components/BotOrb";
import { Composer } from "../components/Composer";
import { Fade, Modal, StatusPill } from "../components/ui";
import { ago, get, post, type Recipe } from "../lib/api";
import { useApp } from "../lib/store";

const EXAMPLES = [
  "Brief me on everything my files say about my lease",
  "Plan my week: finish report, gym 3x, call mom",
  "Draft a friendly reply to my landlord about the heater",
  "Remember that I'm allergic to peanuts",
];

export function HomePage() {
  const { overview, bots, botById, toast, refresh } = useApp();
  const [bot, setBot] = useState(localStorage.getItem("rewoo-bot") || "woo");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const nav = useNavigate();
  useEffect(() => { get<{ recipes: Recipe[] }>("/api/recipes").then((r) => setRecipes(r.recipes)).catch(() => {}); }, []);
  useEffect(() => localStorage.setItem("rewoo-bot", bot), [bot]);

  async function send(text: string, botId: string) {
    try {
      const r = await post<{ thread_id: string }>("/api/threads", { message: text, bot_id: botId });
      nav(`/chat/${r.thread_id}`);
    } catch (e: any) { toast(e.message, true); }
  }

  const hour = new Date().getHours();
  const hello = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const pending = overview?.pending_approvals || [];
  const working = bots.filter((b) => b.activity?.live).length;

  return (
    <div className="page">
      <section className="hero">
        <motion.div className="team-strip" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.07 } } }}>
          {bots.slice(0, 6).map((b) => (
            <motion.div key={b.id} variants={{ h: { y: 16, opacity: 0 }, s: { y: 0, opacity: 1 } }}>
              <BotOrb color={b.color} state={stateOf(b)} size={b.id === bot ? 58 : 44} title={b.name} />
            </motion.div>
          ))}
        </motion.div>
        <Fade><div className="eyebrow">{hello}{overview?.user_name ? `, ${overview.user_name}` : ""}</div></Fade>
        <Fade delay={0.05}><h1><span className="grad">AI teammates</span> that finish the work.</h1></Fade>
        <Fade delay={0.1}><p>Give a Bot a task like you would a colleague. It uses your private memory, shows every step, learns your routines, and comes back when it needs your OK.</p></Fade>
      </section>

      <Fade delay={0.15}><Composer botId={bot} onBot={setBot} onSend={send} autoFocus /></Fade>
      <div className="chips">
        {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => send(e, bot)}>{e}</button>)}
      </div>

      {overview?.brain.is_demo && (
        <Fade delay={0.2}>
          <div className="soft row" style={{ margin: "26px auto 0", maxWidth: 820, padding: "12px 16px" }}>
            <span className="dot warn" />
            <span className="grow small"><b>Demo brain is on.</b> <span className="muted">Everything works offline so you can explore. Connect OpenAI, Claude, Gemini or a free local model for real intelligence.</span></span>
            <Link to="/settings" className="btn sm">Connect a brain</Link>
          </div>
        </Fade>
      )}

      {(pending.length > 0 || (overview?.proposed_skills || 0) > 0) && (
        <section className="section">
          <div className="head"><h2>Needs you</h2><span className="tiny">Your Bots paused to ask</span></div>
          <div className="inbox">
            {pending.map((a: any) => {
              const b = botById(a.helper_id);
              return (
                <div key={a.id} className="glass inbox-item">
                  <BotOrb color={b.color} state="waiting" size={34} />
                  <div className="grow"><b>{b.name}</b> <span className="muted">wants to {String(a.tool).replace(/_/g, " ")}</span>
                    <div className="tiny">{a.title}</div></div>
                  <button className="btn sm" onClick={async () => { await post(`/api/approvals/${a.id}`, { approve: false }); refresh(); }}>Not now</button>
                  <button className="btn sm mint" onClick={async () => { await post(`/api/approvals/${a.id}`, { approve: true }); refresh(); }}><Hand size={14} />Allow</button>
                  {a.thread_id && <Link className="btn sm ghost" to={`/chat/${a.thread_id}`}>Open</Link>}
                </div>
              );
            })}
            {(overview?.proposed_skills || 0) > 0 && (
              <Link to="/skills" className="glass inbox-item" style={{ color: "inherit", textDecoration: "none" }}>
                <GraduationCap size={22} color="var(--mint)" />
                <div className="grow"><b>{overview!.proposed_skills} new skill{overview!.proposed_skills > 1 ? "s" : ""} learned</b>
                  <div className="tiny">Review and approve so your Bots get better at this next time.</div></div>
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <div className="head"><h2>Your team</h2><span className="tiny">{working ? `${working} working now` : "All idle — give them something to do"} · <Link to="/team">Manage</Link></span></div>
        <div className="grid bots-grid">
          {bots.map((b, i) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
              <div className={`glass botcard ${b.activity?.live ? "live" : ""}`} style={{ ["--c" as any]: b.color }}
                onClick={() => { setBot(b.id); document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <BotOrb color={b.color} state={stateOf(b)} size={52} emoji={b.emoji} />
                  <div className="grow"><div className="job">{b.job || "Teammate"}</div><h3>{b.name}</h3></div>
                  {b.engine !== "rewoo" && <span className="pill">{b.engine}</span>}
                  {b.profile === "private" && <span className="pill priv">🔒</span>}
                </div>
                <div className="small muted" style={{ marginTop: 10, position: "relative", zIndex: 1 }}>{b.tagline}</div>
                <div className="status">
                  {b.activity?.live ? (<><span className="typing" style={{ color: b.color }}><i /><i /><i /></span>
                    <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.activity.text || "Working…"}</span>
                    {b.activity.task_id && <span className="tiny">live</span>}</>)
                    : <span className="faint">Ready</span>}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="head"><h2>One-click routines</h2><span className="tiny">Fill a blank, press go · <Link to="/routines">Schedule your own</Link></span></div>
        <div className="grid recipes-row">
          {recipes.map((r) => (
            <div key={r.id} className="glass recipe" onClick={() => setRecipe(r)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setRecipe(r)}>
              <div className="em">{r.emoji}</div><h3>{r.title}</h3><p>{r.description}</p>
            </div>
          ))}
        </div>
      </section>

      {(overview?.recent_tasks?.length || 0) > 0 && (
        <section className="section">
          <div className="head"><h2>Recent work</h2></div>
          <div className="list">
            {overview!.recent_tasks.slice(0, 6).map((t) => {
              const b = botById(t.helper_id);
              return (
                <Link key={t.id} to={`/chat/${t.thread_id}`} className="soft row" style={{ padding: "10px 14px", color: "inherit", textDecoration: "none" }}>
                  <BotOrb color={b.color} size={26} state="idle" />
                  <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  <StatusPill status={t.status} /><span className="tiny">{ago(t.created_at)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <RecipeModal recipe={recipe} onClose={() => setRecipe(null)} />
    </div>
  );
}

function RecipeModal({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const { botById, toast } = useApp();
  const [vals, setVals] = useState<Record<string, string>>({});
  const nav = useNavigate();
  useEffect(() => setVals({}), [recipe]);
  if (!recipe) return <Modal open={false} onClose={onClose}>{null}</Modal>;
  const b = botById(recipe.helper);
  return (
    <Modal open={!!recipe} onClose={onClose} label={recipe.title}>
      <div className="row"><div className="recipe" style={{ padding: 0 }}><div className="em">{recipe.emoji}</div></div>
        <div className="grow"><h2>{recipe.title}</h2><div className="muted small">{recipe.description}</div></div></div>
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          const t = await post<{ thread_id: string }>(`/api/recipes/${recipe.id}/run`, { inputs: vals });
          onClose();
          nav(`/chat/${t.thread_id}`);
        } catch (err: any) { toast(err.message, true); }
      }}>
        {recipe.fields.map((f, i) => (
          <div key={f.name}>
            <label className="label">{f.label}</label>
            {f.multiline
              ? <textarea className="field" rows={3} placeholder={f.placeholder} value={vals[f.name] || ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} autoFocus={i === 0} />
              : <input className="field" placeholder={f.placeholder} value={vals[f.name] || ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} autoFocus={i === 0} />}
          </div>
        ))}
        <div className="modal-actions">
          <span className="grow tiny row" style={{ gap: 8 }}><BotOrb color={b.color} size={20} /> {b.name} will handle this</span>
          <button type="submit" className="btn primary">Go</button>
        </div>
      </form>
    </Modal>
  );
}
