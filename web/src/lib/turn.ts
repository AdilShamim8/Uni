// Turns a task's event log into a view model. Pure function → easy to test,
// and the same code renders both live streams and replays.
import type { Ev } from "./api";

export type Step = { key: string; kind: "thought" | "tool" | "context" | "warn" | "ok" | "handoff" | "skills"; icon: string; title: string; detail?: string; depth: number; agent?: string; ok?: boolean };
export type ContextItem = { n: number; kind: string; title: string; text: string; source: string; private?: boolean; why?: string[]; url?: string };
export type Approval = { id: string; tool: string; label: string; emoji: string; input: Record<string, unknown>; reason: string; decided?: boolean; approved?: boolean };

export type TurnView = {
  status: string;
  mood: string; moodText: string;
  plan: string[]; toolsDone: number;
  steps: Step[];
  answer: string; streaming: boolean;
  citations: ContextItem[]; used: ContextItem[]; leftOut: { title: string; reason: string; source?: string }[]; secrets: number;
  usage: { steps: number; tokens: number; cost: number; brain?: string; model?: string };
  approvals: Approval[];
  skill?: { id: string; name: string; description: string };
  brain?: string; engine?: string; onDevice?: boolean;
  error?: string;
  agents: string[];
};

const RESULT_KEYS = ["result", "subject", "fact", "text", "title"] as const;

function describe(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const s = Object.values(input as Record<string, unknown>).filter(Boolean).map(String).join(" · ");
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

export function emptyTurn(status = "queued"): TurnView {
  return { status, mood: "thinking", moodText: "Getting ready…", plan: [], toolsDone: 0, steps: [], answer: "", streaming: false,
    citations: [], used: [], leftOut: [], secrets: 0, usage: { steps: 0, tokens: 0, cost: 0 }, approvals: [], agents: [] };
}

export function applyEvent(v: TurnView, ev: Ev): TurnView {
  const d = ev.data || {};
  const depth = Number(d.depth || 0);
  const t: TurnView = { ...v, steps: v.steps, approvals: v.approvals };
  if (d.agent && !t.agents.includes(d.agent)) t.agents = [...t.agents, d.agent];
  switch (ev.type) {
    case "started":
      return { ...t, status: "running", brain: d.brain, engine: d.engine, onDevice: d.on_device, mood: "thinking", moodText: "Starting…" };
    case "status": {
      const mood = d.state === "working" ? "working" : d.state;
      return { ...t, mood, moodText: d.text || t.moodText, status: d.state === "waiting" ? "waiting" : t.status === "waiting" ? "running" : t.status };
    }
    case "plan":
      return depth ? t : { ...t, plan: d.steps || [] };
    case "thought":
      return { ...t, steps: [...t.steps, { key: `th${ev.seq}`, kind: "thought", icon: "💭", title: d.text, depth, agent: d.agent }] };
    case "context": {
      const used: ContextItem[] = d.used || [];
      const left = d.left_out || [];
      const step: Step = { key: `cx${ev.seq}`, kind: "context", icon: "🧠", depth, agent: d.agent,
        title: used.length ? `Found ${used.length} relevant thing${used.length > 1 ? "s" : ""} in your memory` : "Checked your memory",
        detail: left.length ? `${left.length} left out — see Context` : undefined };
      return { ...t, steps: [...t.steps, step], citations: [...t.citations, ...used], used: [...t.used, ...used],
        leftOut: [...t.leftOut, ...left], secrets: t.secrets + (d.secrets_hidden || 0) };
    }
    case "context_update":
      return { ...t, citations: [...t.citations, ...(d.added || [])], used: [...t.used, ...(d.added || [])] };
    case "skills_used":
      return { ...t, steps: [...t.steps, { key: `sk${ev.seq}`, kind: "skills", icon: "🎓", depth, agent: d.agent,
        title: `Using a skill I learned: ${(d.skills || []).map((s: any) => s.name).join(", ")}` }] };
    case "handoff":
      return { ...t, steps: [...t.steps, { key: `ho${ev.seq}`, kind: "handoff", icon: "🤝", depth, agent: d.agent,
        title: `Handed part of this to ${d.to_name || d.to}`, detail: d.request }] };
    case "tool_started":
      return { ...t, steps: [...t.steps, { key: `tl${ev.seq}`, kind: "tool", icon: d.emoji || "🔧", title: d.label || d.tool, detail: describe(d.input), depth, agent: d.agent }] };
    case "tool_finished": {
      const steps = [...t.steps];
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].kind === "tool" && steps[i].ok === undefined) {
          const r = d.data || {};
          let extra = "";
          if (r.found !== undefined) extra = r.found ? `found ${r.found} more` : "nothing new";
          else for (const k of RESULT_KEYS) if (r[k]) { extra = String(r[k]); break; }
          if (r.error) extra = String(r.error);
          steps[i] = { ...steps[i], ok: !!d.ok, detail: [steps[i].detail, extra && `→ ${extra}`].filter(Boolean).join("  ") };
          break;
        }
      }
      return { ...t, steps, toolsDone: depth ? t.toolsDone : t.toolsDone + 1 };
    }
    case "tool_error":
      return { ...t, steps: [...t.steps, { key: `te${ev.seq}`, kind: "warn", icon: "⚠️", title: d.text || "Tool problem", depth }] };
    case "paperclip_run":
      return { ...t, steps: [...t.steps, { key: `pc${ev.seq}`, kind: "handoff", icon: "📎", depth: 0, agent: d.agent,
        title: `Paperclip assigned this${d.issue ? ` (${d.issue})` : ""}`, detail: d.wake ? `wake: ${d.wake}` : undefined }] };
    case "paperclip_reported":
      return { ...t, steps: [...t.steps, { key: `pr${ev.seq}`, kind: d.error ? "warn" : "ok", icon: "📎", depth: 0, agent: d.agent,
        title: d.error ? "Couldn't report back to Paperclip" : `Reported back to Paperclip: ${d.status}`, detail: d.error }] };
    case "brain_switch":
      return { ...t, steps: [...t.steps, { key: `bs${ev.seq}`, kind: "warn", icon: "🔀", title: `Switched to backup brain ${d.to}`, detail: d.reason, depth }] };
    case "approval_requested":
      return { ...t, status: "waiting", mood: "waiting", moodText: "Waiting for your OK…",
        approvals: [...t.approvals, { id: d.id, tool: d.tool, label: d.label, emoji: d.emoji, input: d.input || {}, reason: d.reason }] };
    case "approval_decided":
      return { ...t, status: "running", approvals: t.approvals.map((a) => (a.id === d.id ? { ...a, decided: true, approved: d.approved } : a)),
        steps: [...t.steps, { key: `ad${ev.seq}`, kind: d.approved ? "ok" : "warn", icon: d.approved ? "👍" : "✋", title: d.approved ? "You said yes" : "You said no — skipped", depth }] };
    case "usage":
      return { ...t, usage: { steps: d.steps, tokens: (d.input_tokens || 0) + (d.output_tokens || 0), cost: d.cost_usd || 0, brain: d.brain, model: d.model } };
    case "answer_delta":
      return depth ? t : { ...t, answer: t.answer + (d.text || ""), streaming: true, mood: "writing" };
    case "answer_reset":
      return { ...t, answer: "", streaming: false };
    case "answer":
      return depth ? t : { ...t, answer: d.text || t.answer, streaming: false, mood: "done", moodText: "Done" };
    case "skill_proposed":
      return { ...t, skill: d.skill };
    case "done":
      return { ...t, status: "done", streaming: false, mood: "done", moodText: "Done" };
    case "error": case "stopped": case "cancelled": case "interrupted":
      return { ...t, status: ev.type === "error" ? "failed" : ev.type, streaming: false, mood: "oops", moodText: d.message || ev.type, error: d.message || ev.type };
    default:
      return t;
  }
}

export function reduceTurn(events: Ev[], status = "queued"): TurnView {
  return events.reduce(applyEvent, emptyTurn(status));
}

export const LIVE = new Set(["queued", "running", "waiting"]);
