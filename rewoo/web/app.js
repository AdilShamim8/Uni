// ReWoo web app — no build step, no framework. Plain modern JavaScript.
// Talks to the FastAPI backend under /api and streams live task events over SSE.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $("#view");
const S = { overview: null, helpers: [], tools: [], recipes: [], pickedHelper: "woo", stream: null };

// ------------------------------------------------------------------ utils
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", headers: {} };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers["Content-Type"] = "application/json"; }
  const r = await fetch(path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || `Request failed (${r.status})`);
  return data;
}

function toast(msg, err = false) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

function modal(html, onMount) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="card modal" role="dialog" aria-modal="true">${html}</div>`;
  function onKey(e) { if (e.key === "Escape") close(); }
  const close = () => { document.removeEventListener("keydown", onKey); bg.remove(); };
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(bg);
  onMount && onMount($(".modal", bg), close);
  return close;
}

const ago = (ts) => {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

const ASK_PHRASE = { remember_fact: "Can I save this to my memory?", web_fetch: "Can I open this web page?", save_note: "Can I save this note?",
  add_todo: "Can I add this to your to-dos?", draft_email: "Can I write this draft?" };
const STATUS_WORDS = { queued: "Getting ready", running: "Working", waiting: "Needs you", done: "Done", failed: "Oops", stopped: "Paused", cancelled: "Stopped", interrupted: "Interrupted" };
const pill = (st) => `<span class="pill ${esc(st)}">${esc(STATUS_WORDS[st] || st)}</span>`;

// Tiny, safe markdown: escape first, then add a few inline/blocks. [n] → citation chip.
function md(src) {
  const inline = (t) => t
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])_(.+?)_(?=[\s.,!?)]|$)/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[(\d{1,3})\](?!\()/g, '<button class="cite" data-n="$1" title="See source $1">$1</button>');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.t}>`); list = null; } };
  for (const raw of esc(src || "").split("\n")) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (!list || list.t !== "ul") { flush(); list = { t: "ul", items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (!list || list.t !== "ol") { flush(); list = { t: "ol", items: [] }; } list.items.push(m[1]); continue; }
    flush();
    if (!line.trim()) continue;
    if ((m = line.match(/^#{1,4}\s+(.*)/))) out.push(`<h3>${inline(m[1])}</h3>`);
    else if ((m = line.match(/^&gt;\s?(.*)/))) out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}

// ------------------------------------------------------------------ Woo, the mascot
function woo(state = "idle", size = 150) {
  return `<svg class="woo ${state}" viewBox="0 0 200 200" width="${size}" height="${size}" aria-hidden="true">
  <ellipse cx="100" cy="186" rx="48" ry="7" fill="#2b2140" opacity=".12"/>
  <g class="body">
    <line x1="100" y1="34" x2="100" y2="14" stroke="#2b2140" stroke-width="5" stroke-linecap="round"/>
    <circle cx="100" cy="12" r="8" fill="#f5b400" stroke="#2b2140" stroke-width="4"/>
    <path d="M100 32c42 0 66 30 66 72 0 42-28 72-66 72s-66-30-66-72c0-42 24-72 66-72z" fill="#7c5cff" stroke="#2b2140" stroke-width="5"/>
    <path d="M62 62q-14 14-16 34" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".45"/>
    <ellipse cx="64" cy="130" rx="12" ry="7" fill="#ff9ec0" opacity=".75"/>
    <ellipse cx="136" cy="130" rx="12" ry="7" fill="#ff9ec0" opacity=".75"/>
    <g class="eyes">
      <ellipse cx="78" cy="100" rx="14" ry="17" fill="#fff" stroke="#2b2140" stroke-width="4"/>
      <ellipse cx="122" cy="100" rx="14" ry="17" fill="#fff" stroke="#2b2140" stroke-width="4"/>
      <g class="pupils"><circle cx="80" cy="103" r="6.5" fill="#2b2140"/><circle cx="124" cy="103" r="6.5" fill="#2b2140"/>
      <circle cx="82" cy="100" r="2" fill="#fff"/><circle cx="126" cy="100" r="2" fill="#fff"/></g>
    </g>
    <path class="mouth-smile" d="M86 134q14 12 28 0" fill="none" stroke="#2b2140" stroke-width="5" stroke-linecap="round"/>
    <path class="mouth-happy" d="M83 130q17 24 34 0z" fill="#ff7a59" stroke="#2b2140" stroke-width="4" stroke-linejoin="round"/>
    <ellipse class="mouth-o" cx="100" cy="138" rx="7" ry="8" fill="#2b2140"/>
    <path class="mouth-flat" d="M88 138q12-6 24 0" fill="none" stroke="#2b2140" stroke-width="5" stroke-linecap="round"/>
  </g>
  <g class="fx">
    <g class="think"><circle cx="150" cy="44" r="5" fill="#fff" stroke="#2b2140" stroke-width="3"/><circle cx="164" cy="30" r="7" fill="#fff" stroke="#2b2140" stroke-width="3"/><circle cx="182" cy="14" r="9" fill="#fff" stroke="#2b2140" stroke-width="3"/></g>
    <g class="book"><text x="118" y="190" font-size="40">📖</text></g>
    <g class="gear"><text x="144" y="64" font-size="36">⚙️</text></g>
    <g class="hand"><text x="148" y="70" font-size="38">✋</text></g>
    <g class="spark"><text x="146" y="54" font-size="30">✨</text><text x="14" y="70" font-size="24">✨</text></g>
    <g class="sweat"><text x="150" y="70" font-size="28">💧</text></g>
  </g></svg>`;
}

// ------------------------------------------------------------------ shell
async function refreshOverview() {
  S.overview = await api("/api/overview");
  const b = S.overview.brain;
  const chip = $("#brain-chip");
  chip.className = "brain-chip" + (b.is_demo ? " demo" : "");
  chip.innerHTML = `<span class="dot"></span><span><small>Brain${b.on_device ? " · on this device" : ""}</small><strong>${esc(b.name)}</strong></span>`;
  return S.overview;
}

async function loadBasics() {
  const [h, r] = await Promise.all([api("/api/helpers"), api("/api/recipes")]);
  S.helpers = h.helpers; S.tools = h.tools; S.recipes = r.recipes;
}

const helperById = (id) => S.helpers.find((h) => h.id === id) || S.helpers[0] || { name: "Woo", emoji: "🟣", color: "#7c5cff" };
const toolLabel = (name) => (S.tools.find((t) => t.name === name) || {}).label || name;

const routes = { "": home, task: taskView, memory: memoryView, helpers: helpersView, library: libraryView, settings: settingsView };

async function route() {
  if (S.stream) { S.stream.close(); S.stream = null; }
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  const [name, arg] = path.split("/");
  $$("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === (name || "home") || (name === "task" && a.dataset.r === "home")));
  const fn = routes[name] || home;
  try { await fn(arg, new URLSearchParams(query || "")); } catch (e) { view.innerHTML = `<div class="card empty"><div class="big">😵</div><p>${esc(e.message)}</p></div>`; }
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ HOME
async function startTask(prompt, helper) {
  if (!prompt.trim()) return toast("Tell me what you need first 🙂", true);
  const t = await api("/api/tasks", { method: "POST", body: { prompt, helper_id: helper } });
  location.hash = `#/task/${t.id}`;
}

async function home() {
  const o = await refreshOverview();
  const name = o.user_name ? `, ${esc(o.user_name)}` : "";
  const examples = ["What do my files say about my lease?", "Remind me to call the dentist", "Remember that I'm allergic to peanuts", "Calculate 1250 * 12 * 0.9"];
  view.innerHTML = `
    <section class="hero">${woo("idle", 150)}
      <div><h1>Hi${name}! <em>What can I help with?</em></h1>
      <p>Ask me anything. I use your memory (only the parts you allow) and show you exactly what I'm doing.</p></div>
    </section>
    <div class="card askbox">
      <textarea id="ask" rows="2" placeholder="Ask me anything… e.g. “Summarize my notes about the trip”"></textarea>
      <div class="bar"><div class="helper-pick" id="hp"></div><div class="grow"></div>
      <button class="btn primary" id="go">Ask ${esc(helperById(S.pickedHelper).name)} ✨</button></div>
    </div>
    <div class="chips">${examples.map((e) => `<button class="chip">${esc(e)}</button>`).join("")}</div>
    ${o.brain.is_demo ? `<div class="banner"><span class="emoji">🧪</span><div class="grow"><b>You're using the Demo brain.</b> It works offline so you can try everything — connect a real AI (OpenAI, Claude, Gemini, or a free local model) for smart answers.</div><a class="btn small" href="#/settings">Connect a brain</a></div>` : ""}
    ${o.memory.documents === 0 ? `<div class="banner" style="background:var(--mint-soft)"><span class="emoji">🧠</span><div class="grow"><b>Give me a memory.</b> Upload a few files or connect Google Drive, and I'll answer from <i>your</i> stuff — with sources.</div><a class="btn small" href="#/memory">Add memory</a></div>` : ""}
    ${o.pending_approvals.length ? `<div class="banner" style="background:var(--sun-soft)"><span class="emoji">✋</span><div class="grow"><b>I'm waiting for your OK</b> on ${o.pending_approvals.length} thing(s).</div><a class="btn small" href="#/task/${esc(o.pending_approvals[0].task_id)}">Take a look</a></div>` : ""}
    <div class="section-title"><h2>One-click recipes</h2><span class="tiny">Reusable workflows — fill a blank, press go</span></div>
    <div class="grid recipes">${S.recipes.map((r) => `
      <div class="card recipe" data-id="${esc(r.id)}"><div class="em" style="background:${esc(r.color || "#ece6ff")}22">${esc(r.emoji)}</div>
      <h3>${esc(r.title)}</h3><p>${esc(r.description)}</p></div>`).join("")}</div>
    <div class="section-title"><h2>Recent</h2>${o.recent_tasks.length ? "" : '<span class="tiny">Nothing yet</span>'}</div>
    <div class="recent">${o.recent_tasks.map((t) => {
      const h = helperById(t.helper_id);
      return `<a href="#/task/${esc(t.id)}"><span class="avatar" style="width:34px;height:34px;font-size:17px;background:${esc(h.color)}22">${esc(h.emoji)}</span><span class="t">${esc(t.title)}</span>${pill(t.status)}<span class="tiny">${ago(t.created_at)}</span></a>`;
    }).join("")}</div>`;

  const hp = $("#hp");
  const drawHelpers = () => {
    hp.innerHTML = S.helpers.map((h) => `<button data-h="${esc(h.id)}" class="${h.id === S.pickedHelper ? "on" : ""}" title="${esc(h.tagline)}">${esc(h.emoji)} ${esc(h.name)}</button>`).join("");
    $("#go").textContent = `Ask ${helperById(S.pickedHelper).name} ✨`;
  };
  drawHelpers();
  hp.onclick = (e) => { const b = e.target.closest("button"); if (b) { S.pickedHelper = b.dataset.h; drawHelpers(); } };
  const ask = $("#ask");
  ask.focus();
  ask.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); startTask(ask.value, S.pickedHelper).catch((err) => toast(err.message, true)); } };
  $("#go").onclick = () => startTask(ask.value, S.pickedHelper).catch((err) => toast(err.message, true));
  $$(".chip").forEach((c) => (c.onclick = () => { ask.value = c.textContent; ask.focus(); }));
  $$(".recipe").forEach((c) => (c.onclick = () => openRecipe(S.recipes.find((r) => r.id === c.dataset.id))));
}

function openRecipe(r) {
  modal(`
    <div class="row"><div class="avatar" style="background:${esc(r.color)}22">${esc(r.emoji)}</div><div class="grow"><h2>${esc(r.title)}</h2><div class="muted">${esc(r.description)}</div></div></div>
    <form id="rf">${(r.fields || []).map((f) => `<label class="lbl">${esc(f.label)}</label>${f.multiline
      ? `<textarea class="field" name="${esc(f.name)}" rows="3" placeholder="${esc(f.placeholder || "")}"></textarea>`
      : `<input class="field" name="${esc(f.name)}" placeholder="${esc(f.placeholder || "")}" />`}`).join("")}
    <div class="row" style="margin-top:18px"><span class="tiny grow">Handled by ${esc(helperById(r.helper).emoji)} ${esc(helperById(r.helper).name)}</span>
    <button class="btn primary" type="submit">Go ✨</button></div></form>`, (m, close) => {
    const form = $("#rf", m);
    const first = $("input,textarea", form);
    first && first.focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const inputs = Object.fromEntries(new FormData(form).entries());
      try { const t = await api(`/api/recipes/${r.id}/run`, { method: "POST", body: { inputs } }); close(); location.hash = `#/task/${t.id}`; }
      catch (err) { toast(err.message, true); }
    };
  });
}

// ------------------------------------------------------------------ TASK (live)
async function taskView(id) {
  const { task, events } = await api(`/api/tasks/${id}`);
  const h = helperById(task.helper_id);
  view.innerHTML = `
    <div class="task-head"><div class="avatar" style="background:${esc(h.color)}22">${esc(h.emoji)}</div>
      <h1>${esc(task.title)}</h1><span id="st">${pill(task.status)}</span>
      <button class="btn small ghost" id="stop">Stop</button><a class="btn small" href="#/">New question</a></div>
    <div class="task-grid">
      <div>
        <div class="card stage"><div id="mascot">${woo("thinking", 140)}</div>
          <div><div class="bubble" id="bubble">Getting ready…</div><div class="plan" id="plan"></div></div></div>
        <div class="timeline" id="tl"></div>
        <div id="answer"></div>
      </div>
      <aside class="card receipt">
        <h3>🧠 What I'm using</h3>
        <div class="sub">Everything from your memory that I was shown for this task — nothing else.</div>
        <div id="used"><div class="tiny">Nothing yet…</div></div>
        <div id="leftout"></div>
        <div id="secrets"></div>
        <h3 style="margin-top:18px">📊 Effort</h3>
        <div class="meter"><i id="meter"></i></div>
        <div class="stats"><div><b id="u-steps">0</b><small>steps</small></div><div><b id="u-tok">0</b><small>tokens</small></div><div><b id="u-cost">$0</b><small>cost</small></div></div>
        <div class="tiny" id="brain" style="margin-top:12px"></div>
      </aside>
    </div>`;

  const T = { task, plan: [], toolsDone: 0, lastTool: null, items: new Map(), maxSteps: 8, lastSeq: 0 };
  $("#stop").onclick = async () => { await api(`/api/tasks/${id}/cancel`, { method: "POST" }); toast("Asked Woo to stop."); };
  $("#answer").addEventListener("click", (e) => { const c = e.target.closest(".cite"); if (c) flashItem(T, c.dataset.n); });
  api("/api/settings").then((s) => (T.maxSteps = s.budgets.max_steps)).catch(() => {});

  for (const ev of events) applyEvent(T, ev);
  if (["done", "failed", "stopped", "cancelled", "interrupted"].includes(task.status)) {
    if (!events.some((e) => e.type === "answer") && task.result) renderAnswer(T, task.result, []);
    return;
  }
  const es = new EventSource(`/api/tasks/${id}/stream?after=${T.lastSeq}`);
  S.stream = es;
  es.onmessage = (m) => applyEvent(T, JSON.parse(m.data));
  es.addEventListener("end", () => { es.close(); refreshOverview(); });
  es.onerror = () => { /* browser retries automatically */ };
}

function setMood(state, text) {
  const svg = $("#mascot svg");
  if (svg) svg.setAttribute("class", `woo ${state}`);
  if (text) $("#bubble").textContent = text;
}

function addStep(cls, icon, title, detail = "", depth = 0) {
  const el = document.createElement("div");
  el.className = `step ${cls}`;
  if (depth) el.style.marginLeft = "36px";
  el.innerHTML = `<div class="ic">${icon}</div><div class="tx"><b>${title}</b>${detail ? `<div class="detail">${detail}</div>` : ""}</div>`;
  $("#tl").appendChild(el);
  return el;
}

function describeInput(input) {
  const vals = Object.values(input || {}).filter(Boolean).map(String);
  const s = vals.join(" · ");
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

function markPlan(T, all = false) {
  $$("#plan span").forEach((s, i) => s.classList.toggle("ok", all || i < T.toolsDone));
}

function renderItem(T, it) {
  const icon = { fact: "💡", document: "📄", episode: "💬" }[it.kind] || "📄";
  const el = document.createElement("div");
  el.className = "ritem";
  el.innerHTML = `<div class="top"><span class="n">${it.n}</span><span>${icon}</span><span class="grow">${esc(it.title)}</span>${it.private ? '<span class="tag private">🔒 private</span>' : ""}</div>
    <div class="src">${esc(it.source)}${(it.why || []).length ? " · " + it.why.map(esc).join(", ") : ""}${it.url ? ` · <a href="${esc(it.url)}" target="_blank" rel="noopener">open</a>` : ""}</div>
    <div class="snip">${esc(it.text)}</div>`;
  el.onclick = (e) => { if (e.target.tagName !== "A") el.classList.toggle("open"); };
  T.items.set(String(it.n), el);
  return el;
}

function flashItem(T, n) {
  const el = T.items.get(String(n));
  if (!el) return toast("That source isn't in the list.", true);
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash", "open");
  setTimeout(() => el.classList.remove("flash"), 1600);
}

function addItems(T, items) {
  const box = $("#used");
  if (!T.items.size) box.innerHTML = "";
  items.forEach((it) => box.appendChild(renderItem(T, it)));
  if (!T.items.size) box.innerHTML = '<div class="tiny">Nothing from your memory matched this task.</div>';
}

function renderAnswer(T, text, citations) {
  $("#answer").innerHTML = `<div class="card answer"><div class="row" style="margin-bottom:6px"><h3 class="grow">💬 Answer</h3>
    <button class="btn small ghost" id="copy">Copy</button></div><div class="md">${md(text)}</div>
    ${citations && citations.length ? `<div class="tiny" style="margin-top:10px">Sources: ${citations.map((c) => `<button class="cite" data-n="${c.n}">${c.n}</button> ${esc(c.title)}`).join(" · ")}</div>` : ""}</div>`;
  $("#copy").onclick = () => navigator.clipboard.writeText(text).then(() => toast("Copied!"));
}

function applyEvent(T, ev) {
  T.lastSeq = Math.max(T.lastSeq, ev.seq);
  const d = ev.data || {};
  const depth = d.depth || 0;
  const who = depth ? `${esc(helperById(d.agent).emoji)} ${esc(helperById(d.agent).name)}: ` : "";
  switch (ev.type) {
    case "started":
      $("#brain").innerHTML = `Brain: <b>${esc(d.brain)}</b>${d.model ? ` (${esc(d.model)})` : ""}${d.on_device ? " · runs on this device 🔒" : ""}`;
      $("#st").innerHTML = pill("running");
      break;
    case "status":
      setMood(d.state === "working" ? "working" : d.state, who + (d.text || ""));
      if (d.state === "waiting") $("#st").innerHTML = pill("waiting");
      else if ($("#st .waiting")) $("#st").innerHTML = pill("running");
      break;
    case "plan":
      if (!depth) { T.plan = d.steps; $("#plan").innerHTML = d.steps.map((s) => `<span>${esc(s)}</span>`).join(""); }
      break;
    case "thought":
      addStep("thought", "💭", who + esc(d.text), "", depth);
      break;
    case "context": {
      if (!depth || d.used.length) addItems(T, d.used);
      const n = d.used.length;
      addStep("ok", "🧠", who + (n ? `Found ${n} relevant thing${n > 1 ? "s" : ""} in your memory` : "Checked your memory"),
        d.left_out.length ? `${d.left_out.length} left out — see “What I'm using”` : "", depth);
      if (d.left_out.length) $("#leftout").innerHTML += `<h3 style="margin-top:14px;font-size:16px">🙈 Left out</h3>` + d.left_out.map((x) => `<div class="leftout"><b>${esc(x.title)}</b> — ${esc(x.reason)}</div>`).join("");
      if (d.secrets_hidden) $("#secrets").innerHTML = `<div class="leftout" style="background:var(--blue-soft)">🔐 Hid ${d.secrets_hidden} secret${d.secrets_hidden > 1 ? "s" : ""} (passwords, keys) before sending anything out.</div>`;
      break;
    }
    case "context_update":
      addItems(T, d.added);
      break;
    case "tool_started":
      T.lastTool = addStep("tool", d.emoji || "🔧", who + esc(d.label || d.tool), esc(describeInput(d.input)), depth);
      break;
    case "tool_finished": {
      if (!depth) { T.toolsDone += 1; markPlan(T); }
      const el = T.lastTool;
      if (el) {
        el.classList.remove("tool"); el.classList.add(d.ok ? "ok" : "warn");
        const r = d.data || {};
        const extra = r.result ? `= ${r.result}` : r.found !== undefined ? (r.found ? `found ${r.found} more` : "nothing new beyond what I already had") : r.subject ? `draft: “${r.subject}”` : r.fact ? `saved: “${r.fact}”` : r.text ? `added: “${r.text}”` : r.title ? `“${r.title}”` : "";
        if (extra) $(".tx", el).insertAdjacentHTML("beforeend", `<div class="detail">✓ ${esc(extra)}</div>`);
      }
      break;
    }
    case "tool_error":
      addStep("warn", "⚠️", who + esc(d.text), "", depth);
      break;
    case "approval_requested": {
      const el = document.createElement("div");
      el.className = "approval";
      el.id = `ap-${d.id}`;
      el.innerHTML = `<h3>${esc(d.emoji || "✋")} ${esc(ASK_PHRASE[d.tool] || `Is it OK to use “${d.label || d.tool}”?`)}</h3>
        <div class="muted">${esc(d.reason || "")}</div><pre>${esc(describeInput(d.input))}</pre>
        <div class="row"><button class="btn mint" data-a="1">Yes, go ahead</button><button class="btn ghost" data-a="0">Not now</button></div>`;
      el.onclick = async (e) => {
        const b = e.target.closest("button[data-a]");
        if (!b) return;
        $$("button", el).forEach((x) => (x.disabled = true));
        try { await api(`/api/approvals/${d.id}`, { method: "POST", body: { approve: b.dataset.a === "1" } }); }
        catch (err) { toast(err.message, true); }
      };
      $("#tl").appendChild(el);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      break;
    }
    case "approval_decided": {
      const el = $(`#ap-${d.id}`);
      if (el) el.remove();
      addStep(d.approved ? "ok" : "warn", d.approved ? "👍" : "✋", d.approved ? "You said yes" : "You said no — I skipped it", "", depth);
      break;
    }
    case "brain_switch":
      addStep("warn", "🔀", `Switched from ${esc(d.from)} to backup brain ${esc(d.to)}`, esc(d.reason), depth);
      break;
    case "usage":
      $("#u-steps").textContent = d.steps;
      $("#u-tok").textContent = ((d.input_tokens || 0) + (d.output_tokens || 0)).toLocaleString();
      $("#u-cost").textContent = "$" + (d.cost_usd || 0).toFixed(d.cost_usd < 0.01 ? 4 : 2);
      $("#meter").style.width = Math.min(100, (d.steps / (T.maxSteps || 8)) * 100) + "%";
      break;
    case "answer":
      renderAnswer(T, d.text, d.citations);
      setMood("happy", "All done! Here's what I found 🎉");
      markPlan(T, true);
      break;
    case "done":
      $("#st").innerHTML = pill("done");
      $("#stop").classList.add("hidden");
      break;
    case "error": case "stopped": case "cancelled": case "interrupted":
      addStep("warn", { error: "😵", stopped: "⏸️", cancelled: "🛑", interrupted: "⚡" }[ev.type], esc(d.message || ev.type));
      setMood("oops", d.message || "Something went wrong.");
      $("#st").innerHTML = pill(ev.type === "error" ? "failed" : ev.type);
      $("#stop").classList.add("hidden");
      break;
  }
}

// ------------------------------------------------------------------ MEMORY
const SRC_LOOK = { upload: ["📁", "#7c5cff", "Files you upload here."], notes: ["📝", "#ff7a59", "Notes that you or your helpers save."],
  episodes: ["💬", "#18b8a6", "What we talked about before, so I remember context."], gdrive: ["🟢", "#4a6cf7", "Folders you choose from Google Drive (read-only)."] };

async function memoryView(_, q) {
  if (q.get("drive") === "connected") toast("Google Drive connected! Now pick folders. 🎉");
  if (q.get("drive") === "error") toast("Google sign-in didn't finish. Please try again.", true);
  const [m, drive] = await Promise.all([api("/api/memory"), api("/api/drive/status")]);
  const sources = m.sources.filter((s) => s.kind !== "gdrive");
  const gsrc = m.sources.find((s) => s.kind === "gdrive");
  view.innerHTML = `
    <div class="row"><div class="grow"><h1 style="font-size:34px">🧠 Memory</h1>
      <p class="muted" style="margin:6px 0 0">I only use what you switch on. Private sources stay with brains on your own computer. You can forget anything, anytime.</p></div>
      <label class="toggle-row card soft" style="padding:12px 16px"><span class="grow">Pause all memory<small>I'll answer without your data</small></span>
      <span class="switch"><input type="checkbox" id="pause" ${m.paused ? "checked" : ""}><span></span></span></label></div>
    <div class="section-title"><h2>Where I learn from</h2><span class="tiny">${m.stats.documents} document${m.stats.documents === 1 ? "" : "s"} · ${m.stats.chunks} searchable piece${m.stats.chunks === 1 ? "" : "s"}</span></div>
    <div class="grid mem-grid">
      ${driveCard(drive, gsrc)}
      ${sources.map(sourceCard).join("")}
    </div>
    <div class="section-title"><h2>💡 Things I remember about you</h2><span class="tiny">Pinned ones are always in mind</span></div>
    <div class="card soft">
      <form class="row" id="factf"><input class="field grow" id="factin" placeholder="Add something, e.g. “I work night shifts on weekends”" /><button class="btn primary">Remember</button></form>
      <div class="facts" id="facts" style="margin-top:14px"></div>
    </div>
    <div class="section-title"><h2>🔍 Peek: what would I see?</h2><span class="tiny">Type a question to preview what I'd pull from memory</span></div>
    <div class="card soft"><form class="row" id="peekf"><input class="field grow" id="peekin" placeholder="e.g. rent due date" /><button class="btn">Peek</button></form><div id="peek" style="margin-top:14px"></div></div>`;

  const drawFacts = (facts) => {
    $("#facts").innerHTML = facts.length ? facts.map((f) => `<div class="fact ${f.pinned ? "pinned" : ""}" data-id="${esc(f.id)}"><span>${esc(f.text)}</span>
      <button data-act="pin" title="${f.pinned ? "Unpin" : "Pin — always keep in mind"}">${f.pinned ? "📌" : "📍"}</button><button data-act="forget" title="Forget this">🗑️</button></div>`).join("")
      : `<div class="empty"><div class="big">🌱</div>Nothing yet. Tell me things, or ask a helper to “remember that…”.</div>`;
  };
  drawFacts(m.facts);
  $("#facts").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const id = b.closest(".fact").dataset.id;
    const f = (await api("/api/memory/facts")).facts.find((x) => x.id === id);
    if (b.dataset.act === "pin") await api(`/api/memory/facts/${id}`, { method: "PATCH", body: { pinned: !f.pinned } });
    else { await api(`/api/memory/facts/${id}`, { method: "DELETE" }); toast("Forgotten. 🫥"); }
    drawFacts((await api("/api/memory/facts")).facts);
  };
  $("#factf").onsubmit = async (e) => {
    e.preventDefault(); const v = $("#factin").value.trim(); if (!v) return;
    await api("/api/memory/facts", { method: "POST", body: { text: v } }); $("#factin").value = "";
    drawFacts((await api("/api/memory/facts")).facts); toast("Got it — I'll remember that.");
  };
  $("#pause").onchange = async (e) => { await api("/api/memory/pause", { method: "POST", body: { paused: e.target.checked } }); toast(e.target.checked ? "Memory paused." : "Memory is back on."); };
  $("#peekf").onsubmit = async (e) => {
    e.preventDefault();
    const r = await api("/api/memory/search", { method: "POST", body: { query: $("#peekin").value } });
    const T = { items: new Map() };
    const box = $("#peek"); box.innerHTML = "";
    if (!r.used.length) box.innerHTML = '<div class="tiny">Nothing would be used for that.</div>';
    r.used.forEach((it) => box.appendChild(renderItem(T, it)));
    r.left_out.forEach((x) => box.insertAdjacentHTML("beforeend", `<div class="leftout"><b>${esc(x.title)}</b> — ${esc(x.reason)}</div>`));
    if (r.secrets_hidden) box.insertAdjacentHTML("beforeend", `<div class="leftout">🔐 ${r.secrets_hidden} secret(s) would be hidden.</div>`);
  };
  bindSources(view);
  bindDrive(drive);
}

function sourceToggles(s) {
  return `<label class="toggle-row"><span class="grow">I can use this<small>Off = invisible to me</small></span><span class="switch"><input type="checkbox" data-src="${esc(s.id)}" data-k="enabled" ${s.enabled ? "checked" : ""}><span></span></span></label>
  <label class="toggle-row"><span class="grow">Private 🔒<small>Only shared with brains on this computer</small></span><span class="switch blue"><input type="checkbox" data-src="${esc(s.id)}" data-k="private" ${s.private ? "checked" : ""}><span></span></span></label>`;
}

function sourceCard(s) {
  const [icon, color, desc] = SRC_LOOK[s.kind] || ["📦", "#7c5cff", ""];
  return `<div class="card source" data-sid="${esc(s.id)}">
    <div class="head"><div class="avatar" style="background:${color}22">${icon}</div><div class="grow"><h3>${esc(s.name)}</h3><div class="tiny">${s.doc_count} item${s.doc_count === 1 ? "" : "s"}</div></div></div>
    <div class="muted" style="font-size:14.5px">${desc}</div>
    ${s.kind === "upload" ? `<div class="drop" data-drop="${esc(s.id)}">📤 Drop files here or click to upload<div class="tiny">PDF, Word, text, Markdown, CSV, HTML</div><input type="file" multiple hidden></div>` : ""}
    ${sourceToggles(s)}
    <div class="row"><button class="btn small ghost" data-docs="${esc(s.id)}">See items</button>${s.doc_count ? `<button class="btn small ghost" data-wipe="${esc(s.id)}">Forget all</button>` : ""}</div>
    <div class="doclist hidden" id="docs-${esc(s.id)}"></div></div>`;
}

function driveCard(drive, src) {
  const head = `<div class="head"><div class="avatar" style="background:#4a6cf722">🟢</div><div class="grow"><h3>Google Drive</h3><div class="tiny">${drive.connected ? `Connected${drive.account ? " as " + esc(drive.account) : ""}` : "Not connected"}</div></div></div>
    <div class="muted" style="font-size:14.5px">Read-only. You choose the folders; I never see the rest and can't change anything.</div>`;
  if (!drive.configured) {
    return `<div class="card source">${head}
      <details><summary style="cursor:pointer;font-weight:800">Set up Google access (one time, ~5 min)</summary>
      <ol class="steps-list"><li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud → Credentials</a> and enable the <b>Google Drive API</b>.</li>
      <li>Create an <b>OAuth client ID</b> → type <b>Web application</b>.</li>
      <li>Add this redirect URI: <code>${esc(drive.redirect_uri)}</code></li><li>Paste the ID and secret below.</li></ol>
      <input class="field" id="gcid" placeholder="Client ID" style="margin-bottom:8px"><input class="field" id="gcsec" type="password" placeholder="Client secret">
      <button class="btn primary small" id="gsave" style="margin-top:10px">Save</button></details></div>`;
  }
  if (!drive.connected) return `<div class="card source">${head}<a class="btn primary" href="/api/drive/connect">Connect Google Drive</a></div>`;
  const folders = drive.folders.length ? drive.folders.map((f) => `<span class="tag">📂 ${esc(f.name)}</span>`).join("") : '<span class="tiny">No folders chosen yet.</span>';
  return `<div class="card source" data-sid="src_gdrive">${head}
    <div>${folders}</div>
    <div class="row"><button class="btn small" id="gpick">Choose folders</button><button class="btn small mint" id="gsync" ${drive.folders.length ? "" : "disabled"}>Sync now</button></div>
    <div class="tiny">${drive.last_sync ? "Last synced " + ago(drive.last_sync) : "Never synced"} · ${src ? src.doc_count + " files" : "0 files"} · status: ${esc(drive.status)}</div>
    ${src ? sourceToggles(src) : ""}
    <div class="row"><button class="btn small ghost" data-docs="src_gdrive">See items</button><button class="btn small ghost" id="gdisc">Disconnect</button></div>
    <div class="doclist hidden" id="docs-src_gdrive"></div></div>`;
}

function bindSources(root) {
  $$("input[data-src]", root).forEach((inp) => (inp.onchange = async () => {
    await api(`/api/memory/sources/${inp.dataset.src}`, { method: "PATCH", body: { [inp.dataset.k]: inp.checked } });
    toast(inp.dataset.k === "private" ? (inp.checked ? "Private: only on-device brains will see this." : "No longer private.") : (inp.checked ? "I can use this again." : "Hidden from me."));
  }));
  $$("[data-docs]", root).forEach((b) => (b.onclick = async () => {
    const box = $(`#docs-${b.dataset.docs}`);
    box.classList.toggle("hidden");
    if (box.classList.contains("hidden")) return;
    const { documents } = await api(`/api/memory/sources/${b.dataset.docs}/documents`);
    box.innerHTML = documents.length ? documents.map((d) => `<div data-doc="${esc(d.id)}"><span title="${esc(d.title)}">📄 ${esc(d.title)}</span><button class="x" title="Forget this">✕</button></div>`).join("") : '<div class="tiny">Empty</div>';
    box.onclick = async (e) => {
      const row = e.target.closest("[data-doc]");
      if (!row || !e.target.closest(".x")) return;
      await api(`/api/memory/documents/${row.dataset.doc}`, { method: "DELETE" }); row.remove(); toast("Forgotten.");
    };
  }));
  $$("[data-wipe]", root).forEach((b) => (b.onclick = async () => {
    if (!confirm("Forget everything in this source? This can't be undone.")) return;
    await api(`/api/memory/sources/${b.dataset.wipe}`, { method: "DELETE" }); toast("All forgotten."); route();
  }));
  $$("[data-drop]", root).forEach((dz) => {
    const input = $("input", dz);
    const send = async (files) => {
      if (!files.length) return;
      const fd = new FormData(); [...files].forEach((f) => fd.append("files", f));
      dz.innerHTML = "⏳ Reading your files…";
      try {
        const { results } = await api("/api/memory/upload", { method: "POST", body: fd });
        const ok = results.filter((r) => r.ok).length;
        toast(`Learned from ${ok} file${ok === 1 ? "" : "s"}${results.length - ok ? `, ${results.length - ok} skipped` : ""} 🧠`, ok === 0);
        results.filter((r) => !r.ok).forEach((r) => toast(`${r.name}: ${r.reason}`, true));
      } catch (e) { toast(e.message, true); }
      route();
    };
    dz.onclick = () => input.click();
    input.onchange = () => send(input.files);
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = () => dz.classList.remove("over");
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove("over"); send(e.dataTransfer.files); };
  });
}

function bindDrive(drive) {
  const save = $("#gsave");
  if (save) save.onclick = async () => {
    await api("/api/settings", { method: "PUT", body: { google_client_id: $("#gcid").value.trim(), google_client_secret: $("#gcsec").value.trim() } });
    toast("Saved! Now connect your Drive."); route();
  };
  const sync = $("#gsync");
  if (sync) sync.onclick = async () => {
    sync.disabled = true; sync.textContent = "Syncing…";
    try { const { stats } = await api("/api/drive/sync", { method: "POST" }); toast(`Synced: ${stats.indexed} new/updated, ${stats.unchanged} unchanged, ${stats.removed} removed.`); }
    catch (e) { toast(e.message, true); }
    route();
  };
  const disc = $("#gdisc");
  if (disc) disc.onclick = async () => { if (confirm("Disconnect Google Drive and forget its files?")) { await api("/api/drive/disconnect", { method: "POST" }); route(); } };
  const pick = $("#gpick");
  if (pick) pick.onclick = () => folderPicker(drive.folders);
}

function folderPicker(selected) {
  const chosen = new Map(selected.map((f) => [f.id, f]));
  const trail = [{ id: "root", name: "My Drive" }];
  modal(`<h2>📂 Choose folders</h2><div class="muted">I'll only read files inside the folders you tick (and their subfolders).</div>
    <div class="tiny" id="trail" style="margin-top:10px"></div><div class="folder-list" id="fl">Loading…</div>
    <div class="row"><span class="tiny grow" id="cnt"></span><button class="btn primary" id="fsave">Save</button></div>`, (m, close) => {
    const draw = async () => {
      const cur = trail[trail.length - 1];
      $("#trail", m).innerHTML = trail.map((t, i) => `<a href="#" data-i="${i}">${esc(t.name)}</a>`).join(" › ");
      $("#cnt", m).textContent = `${chosen.size} selected`;
      try {
        const { folders } = await api(`/api/drive/folders?parent=${encodeURIComponent(cur.id)}`);
        $("#fl", m).innerHTML = folders.length ? folders.map((f) => `<label><input type="checkbox" data-id="${esc(f.id)}" data-name="${esc(f.name)}" ${chosen.has(f.id) ? "checked" : ""}> <span class="grow">📁 ${esc(f.name)}</span><button class="btn small ghost" data-open="${esc(f.id)}" data-name="${esc(f.name)}">Open ›</button></label>`).join("") : '<div class="tiny">No subfolders here.</div>';
      } catch (e) { $("#fl", m).innerHTML = `<div class="tiny">${esc(e.message)}</div>`; }
    };
    $("#fl", m).onclick = (e) => {
      const o = e.target.closest("[data-open]");
      if (o) { e.preventDefault(); trail.push({ id: o.dataset.open, name: o.dataset.name }); draw(); }
    };
    $("#fl", m).onchange = (e) => {
      const c = e.target; if (!c.dataset.id) return;
      c.checked ? chosen.set(c.dataset.id, { id: c.dataset.id, name: c.dataset.name }) : chosen.delete(c.dataset.id);
      $("#cnt", m).textContent = `${chosen.size} selected`;
    };
    $("#trail", m).onclick = (e) => { const a = e.target.closest("a"); if (a) { e.preventDefault(); trail.splice(+a.dataset.i + 1); draw(); } };
    $("#fsave", m).onclick = async () => { await api("/api/drive/folders", { method: "POST", body: { folders: [...chosen.values()] } }); close(); toast("Folders saved — press Sync now."); route(); };
    draw();
  });
}

// ------------------------------------------------------------------ HELPERS
async function helpersView() {
  await loadBasics();
  view.innerHTML = `<div class="row"><div class="grow"><h1 style="font-size:34px">🤝 Helpers</h1><p class="muted" style="margin:6px 0 0">Each helper has a personality and a set of skills. They can pass work to each other.</p></div>
    <button class="btn primary" id="newh">+ Make a helper</button></div>
    <div class="grid helper-grid" style="margin-top:22px">${S.helpers.map((h) => `
      <div class="card helper-card"><div class="face" style="background:${esc(h.color)}33">${esc(h.emoji)}</div>
        <h3>${esc(h.name)} ${h.profile === "private" ? '<span class="tag private">🔒 on-device only</span>' : ""}</h3>
        <div class="muted">${esc(h.tagline)}</div>
        <div>${(h.tools.length ? h.tools : S.tools.map((t) => t.name)).map((t) => `<span class="tag">${esc(toolLabel(t))}</span>`).join("")}</div>
        <div class="row" style="margin-top:auto"><button class="btn small primary" data-ask="${esc(h.id)}">Ask ${esc(h.name)}</button>
        ${h.builtin ? "" : `<button class="btn small ghost" data-edit="${esc(h.id)}">Edit</button><button class="btn small ghost" data-del="${esc(h.id)}">Delete</button>`}</div>
      </div>`).join("")}</div>`;
  $("#newh").onclick = () => helperForm();
  $$("[data-ask]").forEach((b) => (b.onclick = () => { S.pickedHelper = b.dataset.ask; location.hash = "#/"; }));
  $$("[data-edit]").forEach((b) => (b.onclick = () => helperForm(helperById(b.dataset.edit))));
  $$("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("Delete this helper?")) { await api(`/api/helpers/${b.dataset.del}`, { method: "DELETE" }); helpersView(); } }));
}

function helperForm(h = null) {
  const colors = ["#7c5cff", "#ff7a59", "#18b8a6", "#f5b400", "#e4577b", "#4a6cf7"];
  modal(`<h2>${h ? "Edit" : "Make"} a helper</h2><div class="muted">Give them a name, a vibe, and the skills they're allowed to use.</div>
    <form id="hf"><div class="row"><div style="width:90px"><label class="lbl">Emoji</label><input class="field" name="emoji" value="${esc(h ? h.emoji : "🦊")}" maxlength="4"></div>
    <div class="grow"><label class="lbl">Name</label><input class="field" name="name" required value="${esc(h ? h.name : "")}" placeholder="e.g. Chef"></div></div>
    <label class="lbl">One-line description</label><input class="field" name="tagline" value="${esc(h ? h.tagline : "")}" placeholder="Plans meals from what's in my fridge">
    <label class="lbl">How should they behave?</label><textarea class="field" name="instructions" rows="3" placeholder="Friendly, practical, suggests cheap recipes…">${esc(h ? h.instructions : "")}</textarea>
    <label class="lbl">Colour</label><div class="row">${colors.map((c, i) => `<label><input type="radio" name="color" value="${c}" ${(h ? h.color === c : i === 0) ? "checked" : ""}> <span class="avatar" style="display:inline-grid;width:28px;height:28px;background:${c}"></span></label>`).join("")}</div>
    <label class="lbl">Skills</label><div>${S.tools.map((t) => `<label class="tag" style="cursor:pointer"><input type="checkbox" name="tools" value="${esc(t.name)}" ${h && h.tools.includes(t.name) ? "checked" : ""}> ${esc(t.emoji)} ${esc(t.label)}</label>`).join("")}</div>
    <label class="toggle-row" style="margin-top:14px"><span class="grow">Private helper 🔒<small>Only uses brains running on this computer</small></span><span class="switch blue"><input type="checkbox" name="private" ${h && h.profile === "private" ? "checked" : ""}><span></span></span></label>
    <div class="row" style="margin-top:18px;justify-content:flex-end"><button class="btn primary">Save helper</button></div></form>`, (m, close) => {
    $("#hf", m).onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { name: fd.get("name"), emoji: fd.get("emoji"), tagline: fd.get("tagline"), instructions: fd.get("instructions"),
        color: fd.get("color"), tools: fd.getAll("tools"), profile: fd.get("private") ? "private" : "balanced" };
      if (h) await api(`/api/helpers/${h.id}`, { method: "PUT", body }); else await api("/api/helpers", { method: "POST", body });
      close(); toast(`${body.name} is ready! ✨`); helpersView();
    };
  });
}

// ------------------------------------------------------------------ LIBRARY
async function libraryView(tab) {
  tab = tab || "todos";
  const lib = await api("/api/library");
  const tabs = { todos: `✅ To-dos (${lib.todos.filter((t) => !t.done).length})`, notes: `📝 Notes (${lib.notes.length})`, drafts: `✉️ Drafts (${lib.drafts.length})` };
  const empty = (e, t) => `<div class="card soft empty"><div class="big">${e}</div>${t}</div>`;
  let body = "";
  if (tab === "todos") body = lib.todos.length ? lib.todos.map((t) => `<div class="item ${t.done ? "done" : ""}"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? "checked" : ""} style="width:20px;height:20px;margin-top:3px"><div class="grow"><b>${esc(t.text)}</b>${t.due ? `<div class="tiny">Due ${esc(t.due)}</div>` : ""}</div><button class="x" data-del="todos/${esc(t.id)}">✕</button></div>`).join("") : empty("✅", "No to-dos. Try “Remind me to…” on Home.");
  if (tab === "notes") body = lib.notes.length ? lib.notes.map((n) => `<div class="item"><div class="grow"><b>${esc(n.title)}</b><pre>${esc(n.content)}</pre><div class="tiny">${ago(n.created_at)}</div></div><button class="x" data-del="notes/${esc(n.id)}">✕</button></div>`).join("") : empty("📝", "No notes yet.");
  if (tab === "drafts") body = lib.drafts.length ? lib.drafts.map((d) => `<div class="item"><div class="grow"><b>${esc(d.subject || "(no subject)")}</b>${d.to_addr ? `<div class="tiny">To: ${esc(d.to_addr)}</div>` : ""}<pre>${esc(d.body)}</pre>
    <div class="row" style="margin-top:8px"><button class="btn small" data-copy="${esc(d.id)}">Copy</button><a class="btn small ghost" href="mailto:${encodeURIComponent(d.to_addr || "")}?subject=${encodeURIComponent(d.subject || "")}&body=${encodeURIComponent(d.body || "")}">Open in my email app</a></div></div><button class="x" data-del="drafts/${esc(d.id)}">✕</button></div>`).join("") : empty("✉️", "No drafts. Try the “Draft a reply” recipe.");
  view.innerHTML = `<h1 style="font-size:34px">📚 Library</h1><p class="muted" style="margin:6px 0 18px">Things your helpers made for you. Drafts are never sent — you're always the one who hits send.</p>
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${v}</button>`).join("")}</div><div>${body}</div>`;
  $$("[data-tab]").forEach((b) => (b.onclick = () => (location.hash = `#/library/${b.dataset.tab}`)));
  $$("[data-todo]").forEach((c) => (c.onchange = async () => { await api(`/api/library/todos/${c.dataset.todo}`, { method: "PATCH", body: { done: c.checked } }); libraryView(tab); }));
  $$("[data-del]").forEach((b) => (b.onclick = async () => { await api(`/api/library/${b.dataset.del}`, { method: "DELETE" }); libraryView(tab); }));
  $$("[data-copy]").forEach((b) => (b.onclick = () => { const d = lib.drafts.find((x) => x.id === b.dataset.copy); navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${d.body}`).then(() => toast("Copied!")); }));
}

// ------------------------------------------------------------------ SETTINGS
async function settingsView() {
  const [s, p] = await Promise.all([api("/api/settings"), api("/api/providers")]);
  const modes = { cautious: ["Careful", "Asks before remembering things or going online."], balanced: ["Balanced", "Asks before changing what I remember about you."], autopilot: ["Autopilot", "Only asks before things that can't be undone."] };
  view.innerHTML = `<h1 style="font-size:34px">⚙️ Settings</h1>
    <div class="section-title"><h2>👋 You</h2></div>
    <div class="card soft"><label class="lbl" style="margin-top:0">What should I call you?</label><div class="row"><input class="field grow" id="uname" value="${esc(s.user_name)}" placeholder="Your first name"><button class="btn" id="uname-save">Save</button></div></div>
    <div class="section-title"><h2>🧠 Brains</h2><span class="tiny">The AI models I can think with. Mix and match — you're never locked in.</span></div>
    <div id="plist">${p.providers.map((x) => `<div class="provider ${x.is_default ? "default" : ""}">
      <div class="avatar" style="background:${x.local ? "#18b8a622" : "#7c5cff22"}">${x.type === "demo" ? "🧪" : x.local ? "💻" : "☁️"}</div>
      <div class="grow"><b>${esc(x.name || x.id)}</b> ${x.is_default ? '<span class="tag">main brain</span>' : ""} ${x.local ? '<span class="tag private">on this computer</span>' : ""}
        <div class="tiny">${esc(x.model || "")}${x.has_key ? ` · key ${esc(x.key_hint)}` : ""}${x.base_url ? " · " + esc(x.base_url) : ""}</div></div>
      <label class="tiny"><input type="checkbox" data-fb="${esc(x.id)}" ${s.fallbacks.includes(x.id) ? "checked" : ""} ${x.is_default ? "disabled" : ""}> backup</label>
      <button class="btn small ghost" data-test="${esc(x.id)}">Test</button>
      ${x.is_default ? "" : `<button class="btn small" data-main="${esc(x.id)}">Make main</button>`}
      ${x.type === "demo" ? "" : `<button class="btn small ghost" data-editp="${esc(x.id)}">Edit</button><button class="x" data-rm="${esc(x.id)}">✕</button>`}</div>`).join("")}</div>
    <div class="card soft" style="margin-top:8px"><b>+ Add a brain</b><div class="grid presets" style="margin-top:12px">${p.presets.map((x) => `<button data-preset="${esc(x.id)}">${x.local ? "💻" : "☁️"} ${esc(x.name)}<small>${x.local ? "Free · private · runs locally" : "Needs an API key"}</small></button>`).join("")}
      <button data-preset="custom">🔌 Other (OpenAI-compatible)<small>Any /v1/chat/completions server</small></button></div></div>
    <div class="section-title"><h2>🛡️ When should I ask you first?</h2></div>
    <div class="seg" id="modes">${Object.entries(modes).map(([k, [t, d]]) => `<button data-mode="${k}" class="${s.approval_mode === k ? "on" : ""}"><b>${t}</b><small>${d}</small></button>`).join("")}</div>
    <div class="section-title"><h2>💸 Limits per task</h2><span class="tiny">I stop politely when I hit these</span></div>
    <div class="card soft"><div class="row">
      <div class="grow"><label class="lbl" style="margin-top:0">Max steps</label><input class="field" type="number" min="1" max="30" id="b-steps" value="${s.budgets.max_steps}"></div>
      <div class="grow"><label class="lbl" style="margin-top:0">Max tokens</label><input class="field" type="number" min="1000" step="1000" id="b-tok" value="${s.budgets.max_tokens}"></div>
      <div class="grow"><label class="lbl" style="margin-top:0">Max cost (USD)</label><input class="field" type="number" min="0" step="0.05" id="b-cost" value="${s.budgets.max_cost_usd}"></div>
      <div class="grow"><label class="lbl" style="margin-top:0">Memory per task (tokens)</label><input class="field" type="number" min="300" step="100" id="b-ctx" value="${s.context_tokens}"></div>
    </div><button class="btn" id="b-save" style="margin-top:14px">Save limits</button></div>
    <div class="section-title"><h2>ℹ️ About</h2></div>
    <div class="card soft muted">ReWoo is open source (Apache-2.0), made by Adil Shamim. Your data lives in a single file on this computer (<code>data/rewoo.db</code>). Cost figures are estimates and only appear if you enter prices for a brain.</div>`;

  $("#uname-save").onclick = async () => { await api("/api/settings", { method: "PUT", body: { user_name: $("#uname").value.trim() } }); toast("Nice to meet you! 👋"); refreshOverview(); };
  $$("[data-mode]").forEach((b) => (b.onclick = async () => { await api("/api/settings", { method: "PUT", body: { approval_mode: b.dataset.mode } }); settingsView(); toast("Updated."); }));
  $("#b-save").onclick = async () => {
    await api("/api/settings", { method: "PUT", body: { budgets: { max_steps: +$("#b-steps").value, max_tokens: +$("#b-tok").value, max_cost_usd: +$("#b-cost").value }, context_tokens: +$("#b-ctx").value } });
    toast("Limits saved.");
  };
  $$("[data-main]").forEach((b) => (b.onclick = async () => {
    const fb = s.fallbacks.filter((x) => x !== b.dataset.main);
    await api("/api/settings", { method: "PUT", body: { default_provider: b.dataset.main, fallbacks: fb } }); settingsView(); refreshOverview();
  }));
  $$("[data-fb]").forEach((c) => (c.onchange = async () => {
    const fb = c.checked ? [...s.fallbacks, c.dataset.fb] : s.fallbacks.filter((x) => x !== c.dataset.fb);
    await api("/api/settings", { method: "PUT", body: { fallbacks: fb } }); s.fallbacks = fb; toast(c.checked ? "Added as a backup brain." : "Removed from backups.");
  }));
  $$("[data-test]").forEach((b) => (b.onclick = async () => {
    b.textContent = "Testing…";
    const r = await api(`/api/providers/${b.dataset.test}/test`, { method: "POST" });
    b.textContent = "Test"; toast(r.ok ? `Works! (${r.detail})` : `Didn't work: ${r.detail}`, !r.ok);
  }));
  $$("[data-rm]").forEach((b) => (b.onclick = async () => { if (confirm("Remove this brain?")) { await api(`/api/providers/${b.dataset.rm}`, { method: "DELETE" }); settingsView(); refreshOverview(); } }));
  $$("[data-preset]").forEach((b) => (b.onclick = () => providerForm(b.dataset.preset === "custom"
    ? { id: "custom", type: "openai_compat", name: "My server", base_url: "http://localhost:8000/v1", model: "" } : p.presets.find((x) => x.id === b.dataset.preset), p)));
  $$("[data-editp]").forEach((b) => (b.onclick = () => providerForm(p.providers.find((x) => x.id === b.dataset.editp), p, true)));
}

function providerForm(pre, p, editing = false) {
  const needsKey = !pre.local && pre.type !== "ollama";
  modal(`<h2>${editing ? "Edit" : "Add"} ${esc(pre.name || pre.id)}</h2>
    <div class="muted">${pre.local ? "Runs on your computer — free and private. Make sure the app (e.g. Ollama) is running." : "Your key is stored only in your local ReWoo database."}</div>
    <form id="pf">
      <label class="lbl">Name</label><input class="field" name="name" value="${esc(pre.name || "")}">
      ${needsKey ? `<label class="lbl">API key</label><input class="field" name="api_key" type="password" placeholder="${editing && pre.has_key ? "Leave blank to keep the saved key" : "Paste your key"}">` : ""}
      <label class="lbl">Model</label><input class="field" name="model" value="${esc(pre.model || "")}" placeholder="model name">
      ${pre.type === "openai_compat" || pre.type === "ollama" ? `<label class="lbl">Server address</label><input class="field" name="base_url" value="${esc(pre.base_url || "")}">` : ""}
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:800">More options</summary>
        <label class="lbl">Embedding model (optional, for smarter memory search)</label><input class="field" name="embed_model" value="${esc(pre.embed_model || "")}">
        <div class="row"><div class="grow"><label class="lbl">$ per 1M input tokens</label><input class="field" type="number" step="0.01" name="price_in" value="${pre.price_in || 0}"></div>
        <div class="grow"><label class="lbl">$ per 1M output tokens</label><input class="field" type="number" step="0.01" name="price_out" value="${pre.price_out || 0}"></div></div>
        <label class="toggle-row" style="margin-top:12px"><span class="grow">Runs on this computer<small>Allowed to see private memory</small></span><span class="switch blue"><input type="checkbox" name="local" ${pre.local ? "checked" : ""}><span></span></span></label>
      </details>
      <label class="toggle-row" style="margin-top:12px"><span class="grow">Make this my main brain</span><span class="switch"><input type="checkbox" name="main" ${editing ? "" : "checked"}><span></span></span></label>
      <div class="row" style="margin-top:18px;justify-content:flex-end"><button class="btn primary">Save & test</button></div></form>`, (m, close) => {
    $("#pf", m).onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { id: pre.id, type: pre.type, name: fd.get("name"), model: fd.get("model") || "", base_url: fd.get("base_url") || pre.base_url || "",
        embed_model: fd.get("embed_model") || "", local: !!fd.get("local"), price_in: +fd.get("price_in") || 0, price_out: +fd.get("price_out") || 0 };
      if (needsKey) body.api_key = fd.get("api_key") || "";
      try {
        await api("/api/providers", { method: "POST", body });
        if (fd.get("main")) await api("/api/settings", { method: "PUT", body: { default_provider: pre.id } });
        close();
        const r = await api(`/api/providers/${pre.id}/test`, { method: "POST" });
        toast(r.ok ? `🎉 ${body.name} is connected!` : `Saved, but the test failed: ${r.detail}`, !r.ok);
        settingsView(); refreshOverview();
      } catch (err) { toast(err.message, true); }
    };
  });
}

// ------------------------------------------------------------------ onboarding
function onboarding() {
  let step = 0;
  const steps = [
    () => `<div style="text-align:center">${woo("happy", 130)}<h2>Hi, I'm Woo!</h2><p class="muted">I'm your personal AI helper. I can answer questions from <b>your</b> files, remember what matters to you, draft emails, plan your week and more — and I always show you what I'm doing.</p>
      <label class="lbl" style="text-align:left">What should I call you?</label><input class="field" id="onb-name" placeholder="Your first name"></div>`,
    () => `<div style="text-align:center">${woo("thinking", 120)}<h2>Pick a brain</h2><p class="muted">I can think with many AI models: OpenAI, Claude, Gemini, or a free model on your own computer (Ollama). Right now I'm using a small <b>Demo brain</b> that works offline so you can look around.</p>
      <p class="muted">You can connect a real one anytime in <b>Settings → Brains</b>.</p></div>`,
    () => `<div style="text-align:center">${woo("reading", 120)}<h2>Give me a memory</h2><p class="muted">Upload a few files or connect Google Drive. I'll only use what you switch on, private things stay on your computer, and you can make me forget anything.</p></div>`,
  ];
  const close = modal(`<div id="onb"></div><div class="onb-dots" id="dots"></div><div class="row" style="margin-top:16px"><button class="btn ghost" id="onb-skip">Skip</button><div class="grow"></div><button class="btn primary" id="onb-next">Next</button></div>`, (m) => {
    const draw = () => {
      $("#onb", m).innerHTML = steps[step]();
      $("#dots", m).innerHTML = steps.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("");
      $("#onb-next", m).textContent = step === steps.length - 1 ? "Add my files →" : "Next";
    };
    const finish = async (go) => {
      await api("/api/settings", { method: "PUT", body: { onboarded: true } });
      close(); location.hash = go || "#/"; route();
    };
    $("#onb-next", m).onclick = async () => {
      if (step === 0) { const n = ($("#onb-name", m).value || "").trim(); if (n) await api("/api/settings", { method: "PUT", body: { user_name: n } }); }
      if (step === steps.length - 1) return finish("#/memory");
      step += 1; draw();
    };
    $("#onb-skip", m).onclick = () => finish();
    draw();
  });
}

// ------------------------------------------------------------------ boot
(async function boot() {
  $("#brand-woo").innerHTML = woo("idle", 42);
  window.addEventListener("hashchange", route);
  try {
    await loadBasics();
    const o = await refreshOverview();
    await route();
    if (!o.onboarded) onboarding();
  } catch (e) {
    view.innerHTML = `<div class="card empty"><div class="big">🔌</div><p>Can't reach the ReWoo server. Is it running? (${esc(e.message)})</p></div>`;
  }
})();
