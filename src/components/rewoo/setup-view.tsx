"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, Check, Database, ExternalLink, KeyRound,
  RefreshCw, ShieldAlert, TerminalSquare, TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type HealthInfo } from "@/lib/rewoo-client";
import { ReWooWordmark } from "./logo";

interface Step {
  id: string;
  icon: typeof Database;
  title: string;
  body: string;
  code: string;
  codeLabel: string;
  href?: string;
  hrefLabel?: string;
}

const DOCS_URL = "https://github.com/AdilShamim8/Universe/blob/main/docs/DEPLOYMENT.md";

function buildSteps(status: HealthInfo | null): Step[] {
  const steps: Step[] = [];

  if (status?.dbIssue === "not-configured") {
    steps.push({
      id: "db",
      icon: Database,
      title: "Connect a PostgreSQL database",
      body: "No DATABASE_URL is configured. Serverless hosting needs a real database — create a free PostgreSQL instance (Neon, Supabase, Railway…) and add its connection string to your environment variables.",
      code: "DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require",
      codeLabel: "Vercel → Settings → Environment Variables",
      href: "https://neon.tech",
      hrefLabel: "Create a free Neon database",
    });
  } else if (status?.dbIssue === "serverless-sqlite") {
    steps.push({
      id: "db",
      icon: Database,
      title: "Replace SQLite with PostgreSQL",
      body: "This deployment is using SQLite, which cannot persist on serverless hosting — the filesystem is read-only. Create a free PostgreSQL instance and point DATABASE_URL at it.",
      code: "DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require",
      codeLabel: "Vercel → Settings → Environment Variables",
      href: "https://neon.tech",
      hrefLabel: "Create a free Neon database",
    });
  } else if (status?.dbIssue === "unreachable") {
    steps.push({
      id: "db",
      icon: Database,
      title: "Fix the database connection",
      body: "DATABASE_URL points to a database that cannot be reached — the host may be wrong, credentials invalid, or the database paused. Verify the connection string and update it.",
      code: "DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require",
      codeLabel: "Vercel → Settings → Environment Variables",
    });
  } else if (status?.dbIssue === "schema-missing") {
    steps.push({
      id: "schema",
      icon: TerminalSquare,
      title: "Create the database tables",
      body: "The database is reachable but empty. Run the schema push once from your machine with DATABASE_URL set to this production database, then reload.",
      code: 'DATABASE_URL="postgresql://…" bun run db:push',
      codeLabel: "One-time setup command",
    });
  }

  if (status?.masterKey === "ephemeral") {
    steps.push({
      id: "key",
      icon: KeyRound,
      title: "Set the encryption master key",
      body: "Provider API keys are encrypted at rest (AES-256-GCM). On hosted platforms the master key must come from an environment variable — generate a strong one and set it, or saved keys will not decrypt after a restart.",
      code: "openssl rand -hex 32",
      codeLabel: "Then set REWOO_MASTER_KEY to the output",
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: "unknown",
      icon: ShieldAlert,
      title: "Check the deployment configuration",
      body: "The health endpoint reported a setup problem but could not classify it. Open /api/health on this deployment for details and compare with the deployment checklist in the docs.",
      code: "GET /api/health",
      codeLabel: "Diagnostics endpoint",
      href: DOCS_URL,
      hrefLabel: "Read the deployment guide",
    });
  }
  return steps;
}

function CopyChip({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard unavailable (insecure context) — the text stays selectable.
    }
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/60">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-1.5">
        <span className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <><Check className="size-3" aria-hidden="true" /> Copied</>
          ) : (
            "Copy"
          )}
        </button>
      </div>
      <code className="block select-all overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-foreground">
        {text}
      </code>
    </div>
  );
}

/**
 * Rendered when /api/health reports setupRequired. Turns a silent,
 * broken deployment into a self-explanatory onboarding moment: exactly what is
 * missing, why it matters, and the copy-paste commands to fix it.
 */
export function SetupRequiredView({
  status,
  onRetry,
  onBack,
}: {
  status: HealthInfo | null;
  onRetry: () => void;
  onBack?: () => void;
}) {
  const steps = useMemo(() => buildSteps(status), [status]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <ReWooWordmark />
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" className="rounded-lg" onClick={onBack}>
                ← Back to ReWoo
              </Button>
            )}
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Deployment guide <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-24 pt-14 sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <Badge variant="secondary" className="mb-6 gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
            <TriangleAlert className="size-3.5 text-amber-500" aria-hidden="true" />
            Setup required
          </Badge>

          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            One more step before this workspace is ready.
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted-foreground">
            This deployment is missing required configuration, so ReWoo has paused
            the workspace instead of failing with cryptic errors. Complete the{" "}
            {steps.length === 1 ? "item" : "items"} below, redeploy if you changed
            environment variables, then check again.
          </p>

          <ol className="mt-10 space-y-4">
            {steps.map((step, i) => (
              <motion.li
                key={step.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.08 * (i + 1), ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary">
                    <step.icon className="size-5 text-primary" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">
                      <span className="mr-2 text-muted-foreground/70">{i + 1}.</span>
                      {step.title}
                    </h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                    <div className="mt-4">
                      <CopyChip text={step.code} label={step.codeLabel} />
                    </div>
                    {step.href && (
                      <a
                        href={step.href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {step.hrefLabel} <ArrowRight className="size-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              </motion.li>
            ))}
          </ol>

          <div className="mt-8 rounded-2xl border border-border/70 bg-secondary/40 p-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              After changing environment variables on Vercel, redeploy the project
              for the new values to take effect — then press <span className="font-medium text-foreground">Check again</span>.
              Local self-hosting works out of the box with SQLite; these steps only
              apply to hosted deployments.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" className="h-12 rounded-xl px-6" onClick={onRetry}>
              <RefreshCw className="mr-1.5 size-4" aria-hidden="true" />
              Check again
            </Button>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-6 text-[0.95rem] font-medium transition-colors hover:bg-accent"
            >
              Deployment guide <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Diagnostics come from <code className="rounded bg-secondary px-1.5 py-0.5 font-mono">/api/health</code> — no secrets are ever exposed.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
