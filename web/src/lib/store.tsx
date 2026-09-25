// App-wide state: overview, bots, threads, live activity board (global SSE), toasts, theme.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { get, put, type Bot, type Ev, type Overview, type Thread, type Tool } from "./api";

type Toast = { id: number; text: string; err?: boolean };
type Ctx = {
  overview: Overview | null; bots: Bot[]; tools: Tool[]; threads: Thread[];
  refresh: () => Promise<void>; refreshThreads: () => Promise<void>;
  toast: (text: string, err?: boolean) => void; toasts: Toast[];
  theme: "night" | "day"; setTheme: (t: "night" | "day") => void;
  botById: (id?: string) => Bot;
  lastEvent: Ev | null;
};

const AppCtx = createContext<Ctx | null>(null);
const FALLBACK: Bot = { id: "woo", name: "Woo", emoji: "🟣", color: "#7C5CFF", tagline: "", job: "", instructions: "", tools: [], profile: "balanced", engine: "rewoo", engine_config: {}, builtin: true };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<"night" | "day">((localStorage.getItem("rewoo-theme") as any) || "night");
  const [lastEvent, setLastEvent] = useState<Ev | null>(null);
  const tid = useRef(0);

  const toast = useCallback((text: string, err = false) => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, text, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refreshThreads = useCallback(async () => {
    const t = await get<{ threads: Thread[] }>("/api/threads?limit=40");
    setThreads(t.threads);
  }, []);

  const refresh = useCallback(async () => {
    const [o, b] = await Promise.all([get<Overview>("/api/overview"), get<{ bots: Bot[]; tools: Tool[] }>("/api/bots")]);
    setOverview(o);
    setBots(b.bots);
    setTools(b.tools);
    await refreshThreads();
  }, [refreshThreads]);

  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("rewoo-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "night" ? "#07060d" : "#fff9f2");
  }, [theme]);

  const setTheme = useCallback((t: "night" | "day") => {
    setThemeState(t);
    put("/api/settings", { theme: t }).catch(() => {});
  }, []);

  // Global live stream: keeps the Bots board and sidebar fresh.
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: number | undefined;
    const connect = () => {
      es = new EventSource("/api/stream");
      es.onmessage = (m) => {
        const ev: Ev = JSON.parse(m.data);
        setLastEvent(ev);
        const agent = ev.data?.agent;
        if (agent && ["status", "started", "done", "answer", "error", "stopped", "cancelled", "approval_requested"].includes(ev.type)) {
          setBots((bs) => bs.map((b) => {
            if (b.id !== agent) return b;
            const done = ["done", "answer", "error", "stopped", "cancelled"].includes(ev.type);
            const state = done ? "idle" : ev.type === "approval_requested" ? "waiting" : ev.type === "started" ? "working" : ev.data.state || "working";
            return { ...b, activity: { state, text: done ? "" : ev.data.text || b.activity?.text || "", task_id: ev.task_id, live: !done } };
          }));
        }
        if (["done", "error", "stopped", "cancelled", "queued", "approval_requested", "skill_proposed"].includes(ev.type)) {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => refresh().catch(() => {}), 400);
        }
      };
      es.onerror = () => { es?.close(); window.setTimeout(connect, 3000); };
    };
    connect();
    return () => { es?.close(); window.clearTimeout(timer); };
  }, [refresh]);

  const botById = useCallback((id?: string) => bots.find((b) => b.id === id) || bots[0] || FALLBACK, [bots]);

  const value = useMemo(() => ({ overview, bots, tools, threads, refresh, refreshThreads, toast, toasts, theme, setTheme, botById, lastEvent }),
    [overview, bots, tools, threads, refresh, refreshThreads, toast, toasts, theme, setTheme, botById, lastEvent]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
