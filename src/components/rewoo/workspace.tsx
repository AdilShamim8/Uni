"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Bot, BrainCircuit, Briefcase, ChevronsLeft, Layers, MessageSquare,
  PanelLeft, Pencil, Pin, PinOff, Plus, Puzzle, Search, Settings, Sun, Moon, Workflow, X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  api, type ConversationInfo, type CredentialInfo, type SessionUser,
} from "@/lib/rewoo-client";
import {
  localConversations, localKeys, subscribeLocal, type LocalCredential,
} from "@/lib/local-store";
import { useReWoo, type WorkspaceMode, type WorkspaceView } from "@/lib/rewoo-store";
import { cn } from "@/lib/utils";
import { ChatView } from "./chat-view";
import { ModelsView } from "./models-view";
import { SettingsView } from "./settings-view";
import { PlannedView } from "./planned-view";
import { ReWooWordmark, ReWooMark } from "./logo";

interface NavItem {
  id: WorkspaceView;
  label: string;
  icon: typeof MessageSquare;
  ready: boolean;
}

const NAV_MAIN: NavItem[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, ready: true },
  { id: "models", label: "Models", icon: Layers, ready: true },
];

const NAV_PLANNED: NavItem[] = [
  { id: "agents", label: "Agents", icon: Bot, ready: false },
  { id: "work", label: "Work", icon: Briefcase, ready: false },
  { id: "research", label: "Research", icon: Search, ready: false },
  { id: "automations", label: "Automations", icon: Workflow, ready: false },
  { id: "knowledge", label: "Knowledge", icon: BrainCircuit, ready: false },
  { id: "skills", label: "Skills", icon: Puzzle, ready: false },
  { id: "integrations", label: "Integrations", icon: Layers, ready: false },
  { id: "activity", label: "Activity", icon: Activity, ready: false },
];

interface WorkspaceProps {
  user: SessionUser | null; // null in local (guest) mode
  mode: WorkspaceMode;
  onSignedOut: () => void;
  onOpenSetup: () => void;
}

/**
 * Viewport width ≥ md — hydration-safe via useSyncExternalStore (server
 * snapshot assumes desktop so the initial markup matches, then syncs).
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("resize", onStoreChange);
      return () => window.removeEventListener("resize", onStoreChange);
    },
    () => window.innerWidth >= 768,
    () => true
  );
}

export function Workspace({ user, mode, onSignedOut, onOpenSetup }: WorkspaceProps) {
  const {
    view, setView, sidebarOpen, setSidebarOpen, activeConversationId,
    setActiveConversation,
  } = useReWoo();
  const isDesktop = useIsDesktop();
  // Unset (null) → follow the viewport: expanded on desktop, drawer on mobile.
  const sidebarEffective = sidebarOpen ?? isDesktop;
  const toggleSidebar = useCallback(() => setSidebarOpen(!sidebarEffective), [sidebarEffective, setSidebarOpen]);

  const [credentials, setCredentials] = useState<CredentialInfo[]>([]);
  const [localKeyList, setLocalKeyList] = useState<LocalCredential[]>([]);
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [search, setSearch] = useState("");

  // ── Data loading (mode-aware) ──────────────────────────────────────────────
  const refreshCredentials = useCallback(() => {
    if (mode === "local") {
      // Read on a microtask so effects never call setState synchronously.
      void Promise.resolve().then(() => setLocalKeyList(localKeys.list()));
    } else {
      api.listProviders().then((r) => setCredentials(r.providers)).catch(() => {});
    }
  }, [mode]);

  const refreshConversations = useCallback(() => {
    if (mode === "local") {
      void Promise.resolve().then(() => setConversations(localConversations.list()));
    } else {
      api.listConversations().then((r) => setConversations(r.conversations)).catch(() => {});
    }
  }, [mode]);

  useEffect(() => {
    refreshCredentials();
    refreshConversations();
    // Local mode: stay in sync with writes from any component/tab.
    return subscribeLocal(() => {
      refreshConversations();
      refreshCredentials();
    });
  }, [refreshCredentials, refreshConversations]);

  const newConversation = useCallback(async () => {
    try {
      if (mode === "local") {
        const conv = localConversations.create();
        setActiveConversation(conv.id);
      } else {
        const { conversation } = await api.createConversation();
        refreshConversations();
        setActiveConversation(conversation.id);
      }
      setView("chat");
    } catch {
      /* surfaced by the views themselves */
    }
  }, [mode, refreshConversations, setActiveConversation, setView]);

  // ── Keyboard shortcuts: Mod+K new chat · Mod+B sidebar ────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        void newConversation();
      } else if (key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newConversation, toggleSidebar]);

  const isChat = view === "chat";

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* ── Sidebar (desktop) ──────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarEffective && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-30 hidden shrink-0 flex-col border-r border-border/70 bg-sidebar md:flex"
            aria-label="Workspace navigation"
          >
            <SidebarBody
              mode={mode}
              user={user}
              conversations={conversations}
              activeConversationId={activeConversationId}
              search={search}
              onSearch={setSearch}
              view={view}
              setView={setView}
              onNewConversation={newConversation}
              onSelectConversation={(id) => setActiveConversation(id)}
              onConversationsChanged={refreshConversations}
              onCollapse={() => setSidebarOpen(false)}
              onOpenSettings={() => setView("settings")}
              onSignedOut={onSignedOut}
              onOpenSetup={onOpenSetup}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-border/70 bg-background px-2.5 md:hidden">
          <Button variant="ghost" size="icon" className="size-9" onClick={toggleSidebar} aria-label="Toggle menu">
            <PanelLeft className="size-4.5" aria-hidden="true" />
          </Button>
          <ReWooWordmark size={18} />
          <span className="flex-1" />
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="size-9" onClick={() => setView("settings")} aria-label="Settings">
            <Settings className="size-4.5" aria-hidden="true" />
          </Button>
        </header>

        {/* Mobile drawer overlay + drawer */}
        <AnimatePresence>
          {sidebarEffective && (
            <>
              <motion.div
                key="mobile-sidebar-overlay"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/50 md:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              />
              <motion.div
                key="mobile-drawer"
                initial={{ x: -290 }} animate={{ x: 0 }} exit={{ x: -290 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="fixed bottom-0 left-0 top-0 z-50 flex w-[288px] flex-col border-r border-border bg-sidebar md:hidden"
                aria-label="Navigation"
              >
                <SidebarBody
                  mode={mode}
                  user={user}
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  search={search}
                  onSearch={setSearch}
                  view={view}
                  setView={setView}
                  onNewConversation={newConversation}
                  onSelectConversation={(id) => { setActiveConversation(id); setSidebarOpen(false); }}
                  onConversationsChanged={refreshConversations}
                  onCollapse={() => setSidebarOpen(false)}
                  onOpenSettings={() => { setView("settings"); setSidebarOpen(false); }}
                  onSignedOut={onSignedOut}
                  onOpenSetup={() => { onOpenSetup(); setSidebarOpen(false); }}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Desktop collapsed strip */}
        {!sidebarEffective && (
          <div className="hidden shrink-0 items-center gap-1.5 border-b border-border/70 px-3 py-1.5 md:flex">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setSidebarOpen(true)} title="Expand sidebar (⌘B)" aria-label="Expand sidebar">
              <PanelLeft className="size-4" aria-hidden="true" />
            </Button>
            <ReWooMark size={20} />
            <span className="text-xs text-muted-foreground">Menu (⌘B)</span>
            <span className="flex-1" />
            <ThemeToggle />
          </div>
        )}

        {/* Local-mode banner */}
        {mode === "local" && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-[12px] text-amber-700 dark:text-amber-400" role="status">
            <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              Local mode — accounts, keys and history stay in this browser.
            </span>
            <button
              type="button"
              onClick={onOpenSetup}
              className="shrink-0 rounded-md px-1.5 py-0.5 font-medium underline underline-offset-2 transition-colors hover:bg-amber-500/10"
            >
              Enable cloud sync
            </button>
          </div>
        )}

        {/* View switch */}
        <main className="min-h-0 flex-1" aria-live="polite">
          {view === "chat" && (
            <ChatView
              mode={mode}
              credentials={credentials}
              localKeys={localKeyList}
              conversations={conversations}
              activeId={activeConversationId}
              onConversationsChanged={refreshConversations}
              onSelectConversation={setActiveConversation}
              onOpenSettings={() => setView("settings")}
            />
          )}
          {view === "models" && (
            <ModelsView
              mode={mode}
              credentials={credentials}
              localKeys={localKeyList}
              onOpenSettings={() => setView("settings")}
            />
          )}
          {view === "settings" && (
            <SettingsView
              mode={mode}
              user={user}
              credentials={credentials}
              localKeys={localKeyList}
              onCredentialsChanged={refreshCredentials}
              onLocalKeysChanged={refreshCredentials}
              onSignedOut={onSignedOut}
              onOpenSetup={onOpenSetup}
            />
          )}
          {view !== "chat" && view !== "models" && view !== "settings" && (
            <PlannedView sectionId={view} />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Sidebar body (shared by desktop + mobile drawer) ─────────────────────────

interface SidebarBodyProps {
  mode: WorkspaceMode;
  user: SessionUser | null;
  conversations: ConversationInfo[];
  activeConversationId: string | null;
  search: string;
  onSearch: (s: string) => void;
  view: WorkspaceView;
  setView: (v: WorkspaceView) => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string | null) => void;
  onConversationsChanged: () => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  onSignedOut: () => void;
  onOpenSetup: () => void;
}

function SidebarBody(p: SidebarBodyProps) {
  const { mode, user, conversations, activeConversationId, view, setView } = p;
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => groupConversations(conversations, p.search), [conversations, p.search]);

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <ReWooWordmark size={20} />
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <Button
            variant="ghost" size="icon" className="size-7 rounded-md text-muted-foreground"
            onClick={p.onCollapse} title="Collapse sidebar (⌘B)" aria-label="Collapse sidebar"
          >
            <ChevronsLeft className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="px-3 pb-2">
        <Button variant="secondary" className="w-full justify-start gap-2 rounded-xl text-sm" onClick={p.onNewConversation}>
          <Plus className="size-4" aria-hidden="true" /> New conversation
          <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">⌘K</span>
        </Button>
      </div>

      <div className="px-3 pb-1">
        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/50 px-2.5 py-1.5">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={searchRef}
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            aria-label="Search conversations"
          />
          {p.search && (
            <button type="button" onClick={() => p.onSearch("")} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <nav className="rewoo-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2" aria-label="Sections">
        <NavGroup items={NAV_MAIN} view={view} setView={setView} />
        <p className="mb-1.5 mt-5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          On the roadmap
        </p>
        <NavGroup items={NAV_PLANNED} view={view} setView={setView} />

        {groups.map((g) => (
          <section key={g.label} className="mt-4">
            <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {g.label}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={activeConversationId === c.id}
                  mode={mode}
                  onSelect={() => p.onSelectConversation(c.id)}
                  onChanged={p.onConversationsChanged}
                />
              ))}
            </ul>
          </section>
        ))}

        {p.search.trim() && groups.length === 0 && (
          <p className="mt-4 px-2 text-[12.5px] text-muted-foreground">No conversations match “{p.search}”.</p>
        )}
      </nav>

      <div className="shrink-0 border-t border-border/70 p-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={p.onOpenSettings}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent",
              view === "settings" && "bg-sidebar-accent"
            )}
          >
            <Settings className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {mode === "local" ? (
                <>
                  <span className="block text-[13px] leading-tight">Guest · Local</span>
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">Settings & API keys</span>
                </>
              ) : (
                <>
                  <span className="block text-[13px] leading-tight">{user?.name ?? "Settings"}</span>
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">{user?.email}</span>
                </>
              )}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

// ── Conversation row with hover actions (pin / rename / delete) ──────────────

function ConversationRow({
  conversation, active, mode, onSelect, onChanged,
}: {
  conversation: ConversationInfo;
  active: boolean;
  mode: WorkspaceMode;
  onSelect: () => void;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.title);

  async function saveRename() {
    setRenaming(false);
    const t = title.trim();
    if (!t || t === conversation.title) { setTitle(conversation.title); return; }
    try {
      if (mode === "local") localConversations.update(conversation.id, { title: t });
      else await api.updateConversation(conversation.id, { title: t });
      onChanged();
    } catch { /* non-fatal */ }
  }

  async function remove() {
    if (!confirm(`Delete “${conversation.title}”?`)) return;
    try {
      if (mode === "local") localConversations.delete(conversation.id);
      else await api.deleteConversation(conversation.id);
      onChanged();
    } catch { /* non-fatal */ }
  }

  if (renaming) {
    return (
      <li>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveRename();
            if (e.key === "Escape") { setTitle(conversation.title); setRenaming(false); }
          }}
          className="w-full rounded-lg border border-ring/40 bg-background px-2.5 py-1.5 text-[13px] outline-none"
          aria-label="Rename conversation"
          maxLength={120}
        />
      </li>
    );
  }

  return (
    <li>
      <div
        className={cn(
          "group/conv relative flex items-center rounded-lg transition-colors",
          active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2.5 pr-16 text-left"
          title={conversation.title}
        >
          {conversation.pinned && <Pin className="size-3 shrink-0 text-primary" aria-hidden="true" />}
          <span className={cn("truncate text-[13px]", active ? "text-foreground" : "text-muted-foreground group-hover/conv:text-foreground")}>
            {conversation.title}
          </span>
        </button>
        <div className="absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/conv:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={async () => {
              try {
                if (mode === "local") localConversations.update(conversation.id, { pinned: !conversation.pinned });
                else await api.updateConversation(conversation.id, { pinned: !conversation.pinned });
                onChanged();
              } catch { /* non-fatal */ }
            }}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            aria-label={conversation.pinned ? "Unpin conversation" : "Pin conversation"}
            title={conversation.pinned ? "Unpin" : "Pin"}
          >
            {conversation.pinned ? <PinOff className="size-3" aria-hidden="true" /> : <Pin className="size-3" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => { setTitle(conversation.title); setRenaming(true); }}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            aria-label="Rename conversation"
            title="Rename"
          >
            <Pencil className="size-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={remove}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-destructive"
            aria-label="Delete conversation"
            title="Delete"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Date grouping (LibreChat pattern) ────────────────────────────────────────

interface ConversationGroup {
  label: string;
  items: ConversationInfo[];
}

function groupConversations(list: ConversationInfo[], search: string): ConversationGroup[] {
  const q = search.trim().toLowerCase();
  const filtered = q ? list.filter((c) => c.title.toLowerCase().includes(q)) : list;

  const buckets = new Map<string, ConversationInfo[]>();
  const order: string[] = [];
  for (const c of filtered) {
    const label = c.pinned ? "Pinned" : dateGroupLabel(c.updatedAt);
    if (!buckets.has(label)) { buckets.set(label, []); order.push(label); }
    buckets.get(label)!.push(c);
  }
  const rank: Record<string, number> = { Pinned: 0, Today: 1, Yesterday: 2, "Previous 7 days": 3, "Previous 30 days": 4, Older: 5 };
  return order
    .sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9))
    .map((label) => ({ label, items: buckets.get(label)! }));
}

function dateGroupLabel(updatedAt: string): string {
  const d = new Date(updatedAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - d.getTime()) / 86_400_000);
  if (d.getTime() >= startOfToday) return "Today";
  if (diffDays <= 1) return "Yesterday";
  if (diffDays < 7) return "Previous 7 days";
  if (diffDays < 30) return "Previous 30 days";
  return "Older";
}

// ── Nav ──────────────────────────────────────────────────────────────────────

function NavGroup({
  items, view, setView,
}: {
  items: NavItem[];
  view: WorkspaceView;
  setView: (v: WorkspaceView) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => setView(item.id)}
            aria-current={view === item.id ? "page" : undefined}
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
              view === item.id
                ? "bg-sidebar-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              !item.ready && "opacity-75 hover:opacity-100"
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{item.label}</span>
            {!item.ready && (
              <span className="rounded-full border border-border px-1.5 py-px text-[9px] uppercase tracking-wide text-muted-foreground/80">
                soon
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Theme toggle ─────────────────────────────────────────────────────────────

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Hydration-safe "mounted" check without setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  if (!mounted) {
    return <span className="inline-block size-7" aria-hidden="true" />;
  }
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 rounded-md text-muted-foreground"
      onClick={() => setTheme(dark ? "light" : "dark")}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </Button>
  );
}
