"use client";

import { motion } from "framer-motion";
import {
  ArrowRight, Bot, BrainCircuit, Check, Github, KeyRound, Layers,
  Lock, Search, ShieldCheck, Sparkles, Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { YouWordmark } from "./logo";

const PROVIDER_TAGS = ["OpenAI", "Anthropic", "Google Gemini", "OpenRouter", "Groq", "Mistral", "Ollama", "LM Studio", "Any OpenAI-compatible endpoint"];

const PILLARS = [
  {
    icon: KeyRound,
    title: "Your keys, your models",
    body: "Bring your own API key for OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, or any local OpenAI-compatible server. Keys are encrypted at rest (AES-256-GCM) and never leave the server-side gateway.",
  },
  {
    icon: Bot,
    title: "Agents that finish work",
    body: "Delegate research, drafting, planning, and analysis to specialized agents with durable task state, permission gates, and a live execution timeline you can inspect — never a black box.",
  },
  {
    icon: Lock,
    title: "Privacy by architecture",
    body: "Per-user data isolation, transparent memory, and full export or deletion at any time. The open-source core has no artificial paywalls — premium capabilities belong to everyone.",
  },
];

const ROADMAP = [
  { icon: Sparkles, label: "Chat", status: "Live in this milestone — streaming, persistence, BYOK" },
  { icon: Layers, label: "Models", status: "Live in this milestone — live discovery, capability info" },
  { icon: Bot, label: "Agents", status: "Milestone 3 — durable runs, delegation, approvals" },
  { icon: Search, label: "Research", status: "Milestone 4 — sourced citations, contradiction checks" },
  { icon: Workflow, label: "Automations", status: "Milestone 5 — schedules, background execution" },
  { icon: BrainCircuit, label: "Knowledge", status: "Milestone 4 — permission-aware memory" },
];

export function Landing({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <YouWordmark />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Sections">
            <a href="#why" className="transition-colors hover:text-foreground">Why</a>
            <a href="#capabilities" className="transition-colors hover:text-foreground">Capabilities</a>
            <a href="#providers" className="transition-colors hover:text-foreground">Providers</a>
            <a href="#roadmap" className="transition-colors hover:text-foreground">Roadmap</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onSignIn}>Sign in</Button>
            <Button size="sm" onClick={onStart}>
              Get started <ArrowRight className="ml-1 size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-20 text-center sm:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <Badge variant="secondary" className="mb-6 gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Open source · Apache-2.0 core
          </Badge>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            The AI workspace that answers to&nbsp;
            <span className="text-primary">you</span>, not a subscription.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            YOU brings premium AI capabilities — chat, agents, research, automations — into one
            open-source workspace. Connect your own providers, choose any model, and keep full
            control of your keys, data, and budget.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="h-12 rounded-xl px-6 text-[0.95rem]" onClick={onStart}>
              Create your workspace <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
            </Button>
            <Button size="lg" variant="outline" className="h-12 rounded-xl px-6 text-[0.95rem]" onClick={onSignIn}>
              Sign in
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Works immediately with the offline demo brain — no API key needed to explore.
          </p>
        </motion.div>
      </section>

      {/* Why */}
      <section id="why" className="border-t border-border/60 bg-secondary/40 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight">
            Premium capabilities, none of the walled garden.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            The advanced features other products gate behind subscriptions are in the open-source
            core here. You only ever pay the providers you choose, at cost, with spending you can see.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <motion.article
                key={p.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <p.icon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-3xl font-semibold tracking-tight">One coherent workspace</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            A progressive interface: the most important actions are one click away, advanced controls
            appear when you need them.
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Streaming chat", "Real-time responses from any provider, with cancellation, regeneration, and full history."],
              ["Model discovery", "Live model lists straight from your providers — no stale hardcoded catalogs."],
              ["Encrypted credential vault", "Keys sealed with AES-256-GCM, decrypted only inside the server gateway."],
              ["Conversation history", "Everything persisted, searchable, renameable, deletable — your data, exportable."],
              ["Honest demo mode", "Every feature works out of the box with a clearly-labeled offline brain."],
              ["Self-hostable", "Open source under Apache-2.0. Inspect it, fork it, run it yourself."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2">
                  <Check className="size-4 text-primary" aria-hidden="true" />
                  <h3 className="text-sm font-semibold">{title}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Providers */}
      <section id="providers" className="border-t border-border/60 bg-secondary/40 py-20">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Provider-agnostic by design</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Reduced dependence on any single AI vendor. Switch models mid-conversation; the gateway
            speaks each provider&apos;s protocol so you don&apos;t have to.
          </p>
          <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-2.5">
            {PROVIDER_TAGS.map((t) => (
              <span key={t} className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap — honest status */}
      <section id="roadmap" className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-3xl font-semibold tracking-tight">Where this is going</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            We don&apos;t ship fake buttons. Features appear here when they&apos;re real — and each
            area below states exactly where it stands.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROADMAP.map((r) => (
              <div key={r.label} className="flex items-start gap-3.5 rounded-xl border border-border bg-card p-5">
                <r.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold">{r.label}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA + footer */}
      <footer className="border-t border-border/60 bg-secondary/40">
        <div className="mx-auto max-w-6xl px-5 py-16 text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight">
            Start working with AI that works for you.
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="h-12 rounded-xl px-6" onClick={onStart}>
              Create your workspace <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
            </Button>
            <a
              href="https://github.com/AdilShamim8/ReWoo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-6 text-[0.95rem] font-medium transition-colors hover:bg-accent"
            >
              <Github className="size-4" aria-hidden="true" /> Star on GitHub
            </a>
          </div>
          <p className="mt-14 text-xs text-muted-foreground">
            YOU · open-source AI workspace · Apache-2.0 · provider usage costs are billed by your chosen providers at their rates
          </p>
        </div>
      </footer>
    </div>
  );
}
