import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, ChevronDown, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { BotOrb, stateOf } from "./BotOrb";

// Message box with a Bot picker. Typing "@name " at the start hands the message to that Bot.
export function Composer({ botId, onBot, onSend, busy, onStop, placeholder, autoFocus = false }: {
  botId: string; onBot: (id: string) => void; onSend: (text: string, botId: string) => Promise<void> | void;
  busy?: boolean; onStop?: () => void; placeholder?: string; autoFocus?: boolean;
}) {
  const { bots, botById } = useApp();
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const bot = botById(botId);

  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(240, el.scrollHeight) + "px";
  }, [text]);

  const mention = text.match(/^@(\w+)\s/);
  const mentioned = mention ? bots.find((b) => b.id === mention[1].toLowerCase() || b.name.toLowerCase() === mention[1].toLowerCase()) : undefined;

  async function send() {
    const body = (mentioned ? text.slice(mention![0].length) : text).trim();
    if (!body || sending) return;
    const target = mentioned?.id || botId;
    setSending(true);
    try {
      await onSend(body, target);
      setText("");
      if (mentioned) onBot(mentioned.id);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="glass composer">
      <textarea ref={ref} rows={1} value={text} placeholder={placeholder || `Message ${bot.name}…  (type @ to pick a teammate)`}
        onChange={(e) => { setText(e.target.value); if (e.target.value === "@") setMenu(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Message" />
      <div className="bar">
        <div style={{ position: "relative" }}>
          <button className="botpick" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
            <BotOrb color={(mentioned || bot).color} state={stateOf(mentioned || bot)} size={24} />
            {(mentioned || bot).name}<ChevronDown size={14} className="faint" />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div className="menu" style={{ bottom: 42, left: 0 }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} role="menu"
                onMouseLeave={() => setMenu(false)}>
                {bots.map((b) => (
                  <button key={b.id} className={b.id === botId ? "on" : ""} role="menuitem"
                    onClick={() => { onBot(b.id); setMenu(false); if (text === "@") setText(""); ref.current?.focus(); }}>
                    <BotOrb color={b.color} state={stateOf(b)} size={30} />
                    <span className="grow"><b>{b.name}</b> <span className="faint small">· {b.job || b.engine}</span><small>{b.tagline}</small></span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {mentioned && <span className="pill run">→ {mentioned.name}</span>}
        <span className="grow" />
        <span className="tiny hide-sm">Enter to send · Shift+Enter for a new line</span>
        {busy && onStop ? (
          <button className="btn icon" onClick={onStop} title="Stop" aria-label="Stop"><Square size={15} /></button>
        ) : (
          <button className="btn primary icon" onClick={send} disabled={!text.trim() || sending} title="Send" aria-label="Send"><ArrowUp size={18} /></button>
        )}
      </div>
    </div>
  );
}
