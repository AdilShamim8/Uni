import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { put } from "../lib/api";
import { useApp } from "../lib/store";
import { BotOrb } from "./BotOrb";

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { bots, refresh } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const nav = useNavigate();

  async function finish(to = "/") {
    await put("/api/settings", { onboarded: true, ...(name.trim() ? { user_name: name.trim() } : {}) });
    await refresh();
    onDone();
    nav(to);
  }

  const slides = [
    <>
      <div className="row" style={{ justifyContent: "center", gap: 4, marginBottom: 18 }}>
        {bots.slice(0, 5).map((b, i) => (
          <motion.div key={b.id} initial={{ y: 30, opacity: 0, scale: 0.6 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.09, type: "spring", stiffness: 260, damping: 18 }}>
            <BotOrb color={b.color} state={i === 2 ? "done" : "idle"} size={i === 2 ? 76 : 56} emoji={b.emoji} />
          </motion.div>
        ))}
      </div>
      <div className="eyebrow">Welcome to ReWoo</div>
      <h2 style={{ margin: "8px 0" }}>Meet your AI teammates</h2>
      <p className="muted">Give them real work — research, drafts, plans, reminders. They use <b>your</b> files and notes (only what you allow), show every step, and ask before anything important.</p>
      <label className="label" style={{ textAlign: "left" }}>What should they call you?</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" autoFocus
        onKeyDown={(e) => e.key === "Enter" && setStep(1)} />
    </>,
    <>
      <BotOrb color="#2fd4bf" state="thinking" size={72} />
      <h2 style={{ margin: "16px 0 8px" }}>Pick a brain — or start free</h2>
      <p className="muted">Your team can think with OpenAI, Claude, Gemini, OpenRouter, Groq, or a free private model on your computer (Ollama). Right now they use a small offline <b>Demo brain</b>, so you can try everything immediately.</p>
      <p className="tiny">Connect a real brain anytime in Settings → Brains.</p>
    </>,
    <>
      <BotOrb color="#ff8a66" state="reading" size={72} />
      <h2 style={{ margin: "16px 0 8px" }}>Give them a memory</h2>
      <p className="muted">Upload files or connect Google Drive. Mark anything <b>Private 🔒</b> and it's only shown to brains on your own computer. Every answer comes with a receipt of exactly what was used.</p>
    </>,
  ];

  return (
    <motion.div className="onb" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="glass panel" initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }}>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
            {slides[step]}
          </motion.div>
        </AnimatePresence>
        <div className="dots">{slides.map((_, i) => <i key={i} className={i === step ? "on" : ""} />)}</div>
        <div className="row" style={{ marginTop: 22 }}>
          <button className="btn ghost" onClick={() => finish()}>Skip</button>
          <span className="grow" />
          {step < slides.length - 1
            ? <button className="btn primary" onClick={() => setStep(step + 1)}>Continue</button>
            : <><button className="btn" onClick={() => finish("/settings")}>Connect a brain</button><button className="btn primary" onClick={() => finish("/memory")}>Add my files</button></>}
        </div>
      </motion.div>
    </motion.div>
  );
}
