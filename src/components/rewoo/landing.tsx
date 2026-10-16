"use client";

import { motion } from "framer-motion";
import {
  ArrowRight, Github, KeyRound, Layers, Lock, MessageSquare, MoonStar, Server, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReWooMark, ReWooWordmark } from "./logo";

interface LandingProps {
  setupRequired: boolean;
  onStart: () => void;
  onSignIn: () => void;
  onOpenSetup: () => void;
}

const FEATURES = [
  {
    icon: KeyRound,
    title: "Bring your own keys",
    body: "OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, or any OpenAI-compatible endpoint. Your keys, your billing — zero markup.",
  },
  {
    icon: Layers,
    title: "Every model, one picker",
    body: "Live model discovery straight from your providers. Search, tier badges, and context-window hints — no stale hardcoded lists.",
  },
  {
    icon: MessageSquare,
    title: "Streaming chat that persists",
    body: "Token-by-token streaming with markdown, tables, and syntax-highlighted code. Conversations are searchable, pinnable, and renameable.",
  },
  {
    icon: Lock,
    title: "Local mode, zero setup",
    body: "No database? No problem. The workspace runs entirely in your browser — keys and history never leave your device.",
  },
  {
    icon: Server,
    title: "Cloud mode, encrypted vault",
    body: "Add a Postgres URL and unlock multi-device accounts with server-side AES-256-GCM key storage and full history sync.",
  },
  {
    icon: MoonStar,
    title: "Quiet, precise interface",
    body: "Light, dark, and system themes. Keyboard shortcuts (⌘K, ⌘B). An interface that gets out of the way of your thinking.",
  },
];

export function Landing({ setupRequired, onStart, onSignIn, onOpenSetup }: LandingProps) {
  return (
    <div className="rewoo-scroll min-h-dvh overflow-y-auto bg-background">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <ReWooWordmark size={24} />
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/AdilShamim8/ReWoo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="ReWoo on GitHub"
          >
            <Github className="size-4.5" aria-hidden="true" />
          </a>
          {!setupRequired && (
            <Button variant="ghost" className="rounded-lg" onClick={onSignIn}>
              Sign in
            </Button>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-5">
        <section className="flex flex-col items-center pb-14 pt-10 text-center sm:pt-16">
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] text-muted-foreground"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Open source · Apache-2.0 · Deployable to Vercel
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.06 }}
            className="mt-6 max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            Your AI workspace.{" "}
            <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 bg-clip-text text-transparent">
              Your keys, your models.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.12 }}
            className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground"
          >
            ReWoo is an open-source workspace for talking to any AI model. Connect a provider key,
            pick a model, and chat with streaming, persistence, and full control of your data.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.18 }}
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Button size="lg" className="h-11 gap-2 rounded-xl px-6 text-[15px]" onClick={onStart}>
              {setupRequired ? "Start chatting — no signup" : "Get started"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <a
              href="https://github.com/AdilShamim8/ReWoo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-5 text-[15px] font-medium transition-colors hover:bg-accent"
            >
              <Github className="size-4" aria-hidden="true" />
              Star on GitHub
            </a>
          </motion.div>

          {setupRequired && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="mt-4 text-[12.5px] text-muted-foreground"
            >
              Runs in your browser — no account needed.{" "}
              <button type="button" onClick={onOpenSetup} className="underline underline-offset-2 hover:text-foreground">
                Server owners: enable cloud sync →
              </button>
            </motion.p>
          )}
        </section>

        {/* Product hint */}
        <section className="flex justify-center pb-14" aria-hidden="true">
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }}
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/[0.04]"
          >
            <div className="flex h-10 items-center gap-1.5 border-b border-border/70 px-4">
              <span className="size-2.5 rounded-full bg-red-400/70" />
              <span className="size-2.5 rounded-full bg-amber-400/70" />
              <span className="size-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-3 text-[11px] text-muted-foreground">rewoo — chat</span>
            </div>
            <div className="flex gap-4 p-5 text-left">
              <ReWooMark size={30} />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="h-3 w-4/5 rounded bg-foreground/[0.07]" />
                <div className="h-3 w-3/5 rounded bg-foreground/[0.07]" />
                <div className="h-3 w-2/3 rounded bg-foreground/[0.07]" />
                <div className="mt-4 flex justify-end">
                  <div className="h-8 w-1/2 rounded-xl rounded-br-sm bg-primary/15" />
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Features */}
        <section className="border-t border-border/70 py-14">
          <h2 className="text-center text-2xl font-semibold tracking-tight">Built like the tools you respect</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-[14px] text-muted-foreground">
            The interaction patterns of Open WebUI, LibreChat, and LobeChat — in a lightweight
            codebase you can actually read, run, and ship.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.4, delay: i * 0.05 }}
                className="rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-md hover:shadow-black/[0.04]"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-4.5" aria-hidden="true" />
                </span>
                <h3 className="mt-3.5 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="flex flex-col items-center border-t border-border/70 py-14 text-center">
          <Zap className="size-6 text-primary" aria-hidden="true" />
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">Deploy your own in minutes</h2>
          <p className="mt-2 max-w-md text-[14px] text-muted-foreground">
            Clone, push to Vercel, add an optional database — done. Or run entirely in the browser with local mode.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="h-11 rounded-xl px-6" onClick={onStart}>
              {setupRequired ? "Try it now" : "Create an account"}
            </Button>
            <Button size="lg" variant="outline" className="h-11 rounded-xl px-6" onClick={onOpenSetup}>
              Self-hosting guide
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-[12.5px] text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2">
            <ReWooMark size={18} /> ReWoo — Apache-2.0
          </span>
          <span>UX patterns inspired by Open WebUI · LibreChat · LobeChat</span>
        </div>
      </footer>
    </div>
  );
}
