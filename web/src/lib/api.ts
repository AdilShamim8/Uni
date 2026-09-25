// Typed client for the ReWoo HTTP API.

export type Activity = { state: string; text?: string; task_id?: string; live?: boolean; updated_at?: number };
export type Bot = {
  id: string; name: string; emoji: string; color: string; tagline: string; job: string; instructions: string;
  tools: string[]; profile: string; engine: string; engine_config: Record<string, unknown>; builtin: boolean; activity?: Activity;
};
export type Tool = { name: string; description: string; label: string; emoji: string; risk: string };
export type Ev = { task_id: string; seq: number; type: string; data: any; created_at: number };
export type Task = {
  id: string; title: string; prompt: string; helper_id: string; status: string; result?: string; error?: string;
  thread_id?: string; origin?: string; usage?: any; created_at: number; updated_at?: number;
};
export type Thread = { id: string; title: string; bot_id: string; origin: string; pinned: number; turns?: number; last_status?: string; updated_at: number };
export type Turn = Task & { events: Ev[] };
export type Overview = {
  version: string; user_name: string; onboarded: boolean; theme: "night" | "day";
  brain: { id: string; name: string; model: string; on_device: boolean; is_demo: boolean };
  memory: { facts: number; documents: number; chunks: number; episodes: number }; memory_paused: boolean;
  recent_tasks: Task[]; pending_approvals: any[]; proposed_skills: number; routines: number; running: number;
};
export type Skill = { id: string; name: string; description: string; body: string; version: string; category: string; source: string; status: string; bot_id?: string; uses: number; updated_at: number };
export type Routine = { id: string; bot_id: string; name: string; prompt: string; steps: string[]; schedule: any; schedule_text: string; enabled: boolean; next_run?: number; last_run?: number; runs: number; last_task_id?: string };
export type Recipe = { id: string; emoji: string; color: string; title: string; description: string; helper: string; fields: { name: string; label: string; placeholder?: string; multiline?: boolean }[] };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method || "GET", headers: {}, credentials: "same-origin" };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const r = await fetch(path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = (data as any).detail;
    const msg = typeof d === "string" ? d : d?.error?.message || `Request failed (${r.status})`;
    if (r.status === 401 && (data as any).auth) window.dispatchEvent(new CustomEvent("rewoo:auth"));
    throw new ApiError(msg, r.status);
  }
  return data as T;
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body?: unknown) => api<T>(p, { method: "POST", body: body ?? {} });
export const put = <T = any>(p: string, body?: unknown) => api<T>(p, { method: "PUT", body: body ?? {} });
export const patch = <T = any>(p: string, body?: unknown) => api<T>(p, { method: "PATCH", body: body ?? {} });
export const del = <T = any>(p: string) => api<T>(p, { method: "DELETE" });

export function ago(ts?: number): string {
  if (!ts) return "";
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function until(ts?: number): string {
  if (!ts) return "";
  const s = Math.floor(ts - Date.now() / 1000);
  if (s <= 60) return "any moment";
  if (s < 3600) return `in ${Math.round(s / 60)} min`;
  if (s < 86400) return `in ${Math.round(s / 3600)} h`;
  return new Date(ts * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
