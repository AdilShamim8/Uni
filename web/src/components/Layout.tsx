import { Blocks, BookOpen, Brain, CalendarClock, GraduationCap, Home, Menu, Moon, PanelLeftClose, PanelLeftOpen, Plus, Settings, Sun, Users } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../lib/store";
import { BotOrb } from "./BotOrb";

export function Layout({ children }: { children: React.ReactNode }) {
  const { overview, threads, botById, theme, setTheme } = useApp();
  const [collapsed, setCollapsed] = useState(localStorage.getItem("rewoo-side") === "1");
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => localStorage.setItem("rewoo-side", collapsed ? "1" : "0"), [collapsed]);

  const pending = overview?.pending_approvals?.length || 0;
  const proposed = overview?.proposed_skills || 0;
  const items: [string, string, React.ReactNode, React.ReactNode?][] = [
    ["/", "Home", <Home size={18} />, pending ? <span className="badge sun">{pending}</span> : null],
    ["/team", "Team", <Users size={18} />],
    ["/routines", "Routines", <CalendarClock size={18} />],
    ["/skills", "Skills", <GraduationCap size={18} />, proposed ? <span className="badge">{proposed}</span> : null],
    ["/memory", "Memory", <Brain size={18} />],
    ["/connections", "Connections", <Blocks size={18} />],
    ["/library", "Library", <BookOpen size={18} />],
    ["/settings", "Settings", <Settings size={18} />],
  ];
  const brain = overview?.brain;

  return (
    <>
      <div className="aurora" aria-hidden><i /><i /><i /></div>
      <div className="grain" aria-hidden />
      <div className={`shell ${collapsed ? "collapsed" : ""}`}>
        <aside className={`side ${open ? "open" : ""}`} aria-label="Main navigation">
          <Link to="/" className="brand" aria-label="ReWoo home">
            <BotOrb color="#8b6cff" state="idle" size={30} />
            {!collapsed && <b>Re<span>Woo</span></b>}
          </Link>
          <button className={`btn primary newchat ${collapsed ? "icon" : ""}`} onClick={() => nav("/")} title="New chat">
            <Plus size={16} />{!collapsed && "New chat"}
          </button>
          <nav className="nav">
            {items.map(([to, label, icon, badge]) => (
              <NavLink key={to} to={to} end={to === "/"} title={label}>
                {icon}{!collapsed && <span>{label}</span>}{!collapsed && badge && <span className="badge-wrap" style={{ marginLeft: "auto" }}>{badge}</span>}
              </NavLink>
            ))}
          </nav>
          {!collapsed && <div className="side-label">Chats</div>}
          <div className="threads">
            {!collapsed && threads.map((t) => {
              const b = botById(t.bot_id);
              const live = t.last_status === "running" || t.last_status === "waiting" || t.last_status === "queued";
              return (
                <NavLink key={t.id} to={`/chat/${t.id}`} className={({ isActive }) => (isActive ? "active" : "")} title={t.title}>
                  <BotOrb color={b.color} state={live ? (t.last_status === "waiting" ? "waiting" : "working") : "idle"} size={18} />
                  <span className="t">{t.title}</span>
                  {t.origin !== "app" && <span className="tiny">{t.origin === "telegram" ? "✈︎" : t.origin === "routine" ? "⟳" : t.origin === "api" ? "API" : t.origin === "paperclip" ? "📎" : ""}</span>}
                </NavLink>
              );
            })}
            {!collapsed && !threads.length && <div className="tiny" style={{ padding: "4px 10px" }}>No chats yet</div>}
          </div>
          <div className="side-foot">
            {!collapsed && brain && (
              <Link to="/settings" className="brainchip" title="Change brain">
                <span className={`dot ${brain.is_demo ? "warn" : ""}`} />
                <span className="grow"><small>Brain{brain.on_device ? " · on this device" : ""}</small><strong>{brain.name}</strong></span>
              </Link>
            )}
            <div className="row" style={{ justifyContent: collapsed ? "center" : "space-between" }}>
              <button className="btn ghost sm icon" onClick={() => setTheme(theme === "night" ? "day" : "night")} title={`Switch to ${theme === "night" ? "Day" : "Night"} theme`} aria-label="Toggle theme">
                {theme === "night" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {!collapsed && <span className="tiny">v{overview?.version || ""}</span>}
              <button className="btn ghost sm icon" onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Expand" : "Collapse"} aria-label="Toggle sidebar">
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>
          </div>
        </aside>
        <main className="main" id="main">
          <div className="mobile-top">
            <button className="btn ghost icon" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
            <Link to="/" className="brand" style={{ padding: 0 }}><BotOrb color="#8b6cff" size={24} /><b>Re<span>Woo</span></b></Link>
          </div>
          {children}
        </main>
      </div>
      {open && <div className="modal-bg" style={{ zIndex: 60, background: "rgba(0,0,0,.4)" }} onClick={() => setOpen(false)} />}
    </>
  );
}
