"use client";

import type { LucideIcon } from "lucide-react";
import { Bot, BrainCircuit, Layers, Puzzle, Search, Workflow, Activity, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface PlannedSection {
  id: string;
  title: string;
  icon: LucideIcon;
  milestone: string;
  summary: string;
  bullets: string[];
}

export const PLANNED_SECTIONS: PlannedSection[] = [
  {
    id: "agents",
    title: "Agents",
    icon: Bot,
    milestone: "Milestone 3",
    summary: "Durable agent runs you can delegate work to and watch step by step.",
    bullets: [
      "Specialised agents with tool permissions and execution budgets",
      "Real durable task state — not parallel chat messages pretending to be agents",
      "Live execution timeline: every tool call, approval, and hand-off",
      "Human approval checkpoints before consequential actions",
    ],
  },
  {
    id: "work",
    title: "Work",
    icon: Briefcase,
    milestone: "Milestone 3",
    summary: "The execution workspace for delegated, multi-step jobs.",
    bullets: [
      "Multi-step workflows with pause, resume, retry, and recovery",
      "Document, spreadsheet, and file assembly outputs",
      "Isolated execution environments for untrusted content",
    ],
  },
  {
    id: "research",
    title: "Research",
    icon: Search,
    milestone: "Milestone 4",
    summary: "Deep research with sources you can verify.",
    bullets: [
      "Research planning, retrieval, and source inspection",
      "Citation tracking with contradiction detection",
      "Reports that separate evidence from inference — no fabricated sources",
    ],
  },
  {
    id: "knowledge",
    title: "Knowledge",
    icon: BrainCircuit,
    milestone: "Milestone 4",
    summary: "Permission-aware memory across conversations and documents.",
    bullets: [
      "Per-user memory with transparent retention controls",
      "Document library with retrieval-augmented answers",
      "Memory correction, export, and deletion",
    ],
  },
  {
    id: "skills",
    title: "Skills",
    icon: Puzzle,
    milestone: "Milestone 4",
    summary: "A standardised extensibility architecture for tools and skills.",
    bullets: [
      "Installable skills with explicit permissions",
      "Tool schema registry and execution inspection",
      "Third-party extensions inside a security framework",
    ],
  },
  {
    id: "automations",
    title: "Automations",
    icon: Workflow,
    milestone: "Milestone 5",
    summary: "Work that continues when you're not watching.",
    bullets: [
      "Schedules and routines with durable background execution",
      "Notifications and approval requests",
      "Persistent companion goals with execution history",
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    icon: Layers,
    milestone: "Milestone 5",
    summary: "Connected applications under your consent.",
    bullets: [
      "OAuth connections you can revoke at any time",
      "Per-integration permission scopes",
      "MCP-compatible tool contracts for the ecosystem",
    ],
  },
  {
    id: "activity",
    title: "Activity",
    icon: Activity,
    milestone: "Milestone 3",
    summary: "The audit trail for everything agents do on your behalf.",
    bullets: [
      "Every agent action with its audit record",
      "Token and cost accounting per provider",
      "Failure and recovery history",
    ],
  },
];

export function PlannedView({ sectionId }: { sectionId: string }) {
  const section = PLANNED_SECTIONS.find((s) => s.id === sectionId) ?? PLANNED_SECTIONS[0];
  const Icon = section.icon;
  return (
    <div className="you-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
              <Icon className="size-5" />
            </span>
            <Badge variant="secondary" className="rounded-full">{section.milestone}</Badge>
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">{section.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{section.summary}</p>
          <ul className="mt-5 space-y-2.5 border-t border-border/70 pt-5">
            {section.bullets.map((b) => (
              <li key={b} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-6 rounded-lg bg-secondary/70 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Not built yet — shown as a roadmap, not a fake feature. This workspace ships only what
            genuinely works; {section.title.toLowerCase()} arrives in {section.milestone} of the
            implementation roadmap.
          </p>
        </div>
      </div>
    </div>
  );
}
