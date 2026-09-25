import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect } from "react";
import { useApp } from "../lib/store";

export function Modal({ open, onClose, children, wide = false, label = "Dialog" }:
  { open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean; label?: string }) {
  // One listener, always removed on close/unmount (fixes the v0.1 listener leak).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div role="dialog" aria-modal="true" aria-label={label} className={`glass modal ${wide ? "wide" : ""}`}
            initial={{ y: 18, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function ToggleRow({ title, hint, checked, onChange }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div className="grow"><b>{title}</b>{hint && <small>{hint}</small>}</div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className={`toast ${t.err ? "err" : ""}`} initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>{t.text}</motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Empty({ icon, children }: { icon: string; children: React.ReactNode }) {
  return <div className="empty soft"><div className="big">{icon}</div>{children}</div>;
}

const STATUS: Record<string, [string, string]> = {
  queued: ["run", "Queued"], running: ["run", "Working"], waiting: ["wait", "Needs you"], done: ["ok", "Done"],
  failed: ["bad", "Failed"], stopped: ["", "Paused"], cancelled: ["", "Stopped"], interrupted: ["bad", "Interrupted"],
};
export function StatusPill({ status }: { status: string }) {
  const [cls, text] = STATUS[status] || ["", status];
  return <span className={`pill ${cls}`}>{text}</span>;
}

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const { toast } = useApp();
  return (
    <button className="btn sm" onClick={() => navigator.clipboard.writeText(text).then(() => toast("Copied"), () => toast("Couldn't copy", true))}>
      {label}
    </button>
  );
}

export function Fade({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}
