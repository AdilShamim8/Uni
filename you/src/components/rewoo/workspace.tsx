"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Bot, BrainCircuit, Briefcase, ChevronsLeft, Layers, MessageSquare,
  PanelLeft, Plus, Puzzle, Search, Settings, Workflow, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  api, type ConversationInfo, type CredentialInfo, type SessionUser,
} from "@/lib/rewoo-client";
import { useReWoo, type WorkspaceView } from "@/lib/rewoo-store";
import { cn } from "@/lib/utils";
import { ChatView } from "./chat-view";
import { ModelsView } from "./models-view";
import { SettingsView } from "./settings-view";
import { PlannedView } from "./planned-view";
import { ReWooWordmark } from "./logo";

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

export function Workspace({ user, onSignedOut }: { user: SessionUser; onSignedOut: () => void }) {
  const {
    view, setView, sidebarOpen, setSidebarOpen, activeConversationId,
    setActiveConversation,
  } = useReWoo();

  const [credentials, setCredentials] = useState<CredentialInfo[]>([]);
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [mobileChatList, setMobileChatList] = useState(false);

  function refreshCredentials() {
    api.listProviders().then((r) => setCredentials(r.providers)).catch(() => {});
  }
  function refreshConversations() {
    api.listConversations().then((r) => setConversations(r.conversations)).catch(() => {});
  }

  useEffect(() => {
    // Desktop: sidebar expanded by default. Mobile: start collapsed (drawer).
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setSidebarOpen(true);
    }
  }, []);

  useEffect(() => {
    refreshCredentials();
    refreshConversations();
  }, []);

  async function newConversation() {
    const { conversation } = await api.createConversation();
    refreshConversations();
    setActiveConversation(conversation.id);
    setView("chat");
    setMobileChatList(false);
  }

  const isChat = view === "chat";

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 264, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-30 hidden shrink-0 flex-col border-r border-border/70 bg-sidebar md:flex"
            aria-label="Workspace navigation"
          >
            <div className="flex h-14 items-center justify-between px-4">
              <ReWooWordmark size={20} />
              <Button
                variant="ghost" size="icon" className="size-7 rounded-md text-muted-foreground"
                onClick={() => setSidebarOpen(false)} title="Collapse sidebar" aria-label="Collapse sidebar"
              >
                <ChevronsLeft className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="px-3 pb-2">
              <Button
                variant="secondary"
                className="w-full justify-start gap-2 rounded-xl text-sm"
                onClick={newConversation}
              >
                <Plus className="size-4" aria-hidden="true" /> New conversation
              </Button>
            </div>

            <nav className="rewoo-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2" aria-label="Sections">
              <NavGroup items={NAV_MAIN} view={view} setView={setView} />
              <p className="mb-1.5 mt-5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                On the roadmap
              </p>
              <NavGroup items={NAV_PLANNED} view={view} setView={setView} />

              {isChat && conversations.length > 0 && (
                <>
                  <p className="mb-1.5 mt-5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    History
                  </p>
                  <ul className="space-y-0.5">
                    {conversations.slice(0, 30).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveConversation(c.id);
                            setMobileChatList(false);
                          }}
                          className={cn(
                            "w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                            activeConversationId === c.id && "bg-sidebar-accent text-foreground"
                          )}
                          title={c.title}
                        >
                          {c.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </nav>

            <div className="border-t border-border/70 p-3">
              <button
                type="button"
                onClick={() => setView("settings")}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent",
                  view === "settings" && "bg-sidebar-accent"
                )}
              >
                <Settings className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="block text-[13px] leading-tight">{user.name ?? "Settings"}</span>
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">{user.email}</span>
                </span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center gap-2 border-b border-border/70 bg-background px-3 md:hidden">
          <Button variant="ghost" size="icon" className="size-9" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
            <PanelLeft className="size-4.5" aria-hidden="true" />
          </Button>
          <ReWooWordmark size={18} />
          <span className="flex-1" />
          {isChat && (
            <Button variant="secondary" size="sm" className="rounded-lg text-xs" onClick={() => setMobileChatList(true)}>
              History
            </Button>
          )}
          <Button variant="ghost" size="icon" className="size-9" onClick={() => setView("settings")} aria-label="Settings">
            <Settings className="size-4.5" aria-hidden="true" />
          </Button>
        </header>

        {/* Expanded sidebar overlay (mobile) */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              key="mobile-sidebar"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              key="mobile-drawer"
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed bottom-0 left-0 top-0 z-50 flex w-72 flex-col border-r border-border bg-sidebar md:hidden"
              aria-label="Navigation"
            >
              <div className="flex h-14 items-center justify-between px-4">
                <ReWooWordmark size={20} />
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="px-3 pb-2">
                <Button variant="secondary" className="w-full justify-start gap-2 rounded-xl text-sm" onClick={newConversation}>
                  <Plus className="size-4" aria-hidden="true" /> New conversation
                </Button>
              </div>
              <nav className="rewoo-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
                <NavGroup items={NAV_MAIN} view={view} setView={setView} onNavigate={() => setSidebarOpen(false)} />
                <p className="mb-1.5 mt-5 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">On the roadmap</p>
                <NavGroup items={NAV_PLANNED} view={view} setView={setView} onNavigate={() => setSidebarOpen(false)} />
                {isChat && conversations.length > 0 && (
                  <ul className="mt-4 space-y-0.5">
                    {conversations.slice(0, 30).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => { setActiveConversation(c.id); setSidebarOpen(false); }}
                          className={cn(
                            "w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                            activeConversationId === c.id && "bg-sidebar-accent text-foreground"
                          )}
                        >
                          {c.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>
              <div className="border-t border-border/70 p-3">
                <button
                  type="button"
                  onClick={() => { setView("settings"); setSidebarOpen(false); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent"
                >
                  <Settings className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{user.name ?? "Settings"}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop collapsed strip */}
        {!sidebarOpen && (
          <div className="hidden shrink-0 items-center gap-1.5 border-b border-border/70 px-3 py-1.5 md:flex">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setSidebarOpen(true)} title="Expand sidebar" aria-label="Expand sidebar">
              <PanelLeft className="size-4" aria-hidden="true" />
            </Button>
            <span className="text-xs text-muted-foreground">Menu</span>
          </div>
        )}

        {/* View switch */}
        <main className="min-h-0 flex-1" aria-live="polite">
          {view === "chat" && (
            <ChatView
              credentials={credentials}
              conversations={conversations}
              activeId={activeConversationId}
              onConversationsChanged={refreshConversations}
              onSelectConversation={setActiveConversation}
              onOpenSettings={() => setView("settings")}
            />
          )}
          {view === "models" && (
            <ModelsView credentials={credentials} onOpenSettings={() => setView("settings")} />
          )}
          {view === "settings" && (
            <SettingsView
              user={user}
              credentials={credentials}
              onCredentialsChanged={refreshCredentials}
              onSignedOut={onSignedOut}
            />
          )}
          {view !== "chat" && view !== "models" && view !== "settings" && (
            <PlannedView sectionId={view} />
          )}
        </main>
      </div>

      {/* Mobile chat history sheet */}
      <AnimatePresence>
        {mobileChatList && isChat && (
          <motion.div
            key="mobile-hist"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setMobileChatList(false)}
          >
            <motion.div
              initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl border-t border-border bg-background p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-sm font-semibold">Conversations</p>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setMobileChatList(false)} aria-label="Close">
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="rewoo-scroll max-h-[52vh] overflow-y-auto">
                <Button variant="secondary" className="mb-2 w-full justify-start gap-2 rounded-xl text-sm" onClick={newConversation}>
                  <Plus className="size-4" aria-hidden="true" /> New conversation
                </Button>
                <ul className="space-y-0.5">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => { setActiveConversation(c.id); setMobileChatList(false); }}
                        className={cn(
                          "w-full truncate rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent",
                          activeConversationId === c.id && "bg-accent text-foreground"
                        )}
                      >
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavGroup({
  items, view, setView, onNavigate,
}: {
  items: NavItem[];
  view: WorkspaceView;
  setView: (v: WorkspaceView) => void;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => { setView(item.id); onNavigate?.(); }}
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
