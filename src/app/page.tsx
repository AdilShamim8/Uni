"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type HealthInfo, type SessionUser } from "@/lib/rewoo-client";
import { useReWoo } from "@/lib/rewoo-store";
import { Landing } from "@/components/rewoo/landing";
import { AuthView } from "@/components/rewoo/auth-view";
import { Workspace } from "@/components/rewoo/workspace";
import { SetupRequiredView } from "@/components/rewoo/setup-view";
import { ReWooMark } from "@/components/rewoo/logo";

type Stage = "loading" | "landing" | "auth" | "workspace" | "setup";

export default function Home() {
  const [stage, setStage] = useState<Stage>("loading");
  const [setupStatus, setSetupStatus] = useState<HealthInfo | null>(null);
  const { setUser, setMode, setSetupInfo, setSelection } = useReWoo();

  /**
   * Boot sequence: check deployment health and session in parallel.
   * A misconfigured deployment (no DATABASE_URL / master key) no longer
   * blocks the app — the workspace runs in Local Mode (browser-only
   * persistence) and the setup guide stays one click away.
   */
  const boot = useCallback(async () => {
    setStage("loading");
    const [meRes, health] = await Promise.all([
      api.me().catch(() => ({ user: null as SessionUser | null })),
      api.health(),
    ]);
    const setupRequired = !!health?.setupRequired;
    setSetupStatus(health);
    setSetupInfo(setupRequired ? health : null);

    if (!setupRequired) {
      const user = meRes.user;
      setUser(user);
      setMode("cloud");
      setStage(user ? "workspace" : "landing");
      return;
    }
    // No database configured: guests use Local Mode; signed-in sessions are
    // impossible here (auth requires the DB). Returning local users (with
    // existing browser data) go straight back to their workspace.
    setUser(null);
    setMode("local");
    const hasLocalData =
      typeof window !== "undefined" && !!window.localStorage.getItem("rewoo.local.v1");
    setStage(hasLocalData ? "workspace" : "landing");
  }, [setUser, setMode, setSetupInfo]);

  useEffect(() => {
    void boot();
  }, [boot]);

  /** Enter the workspace in Local Mode (browser-only, no account). */
  const startLocal = useCallback(() => {
    setUser(null);
    setMode("local");
    setStage("workspace");
  }, [setUser, setMode]);

  /** Enter the workspace with a cloud account (DB configured). */
  const enterCloud = useCallback((user: SessionUser) => {
    setUser(user);
    setMode("cloud");
    setStage("workspace");
  }, [setUser, setMode]);

  /** Leave the workspace back to the landing page. */
  const exitWorkspace = useCallback(async () => {
    setSelection(null, null);
    await boot();
  }, [boot, setSelection]);

  switch (stage) {
    case "loading":
      return (
        <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading">
          <div className="flex flex-col items-center gap-3">
            <ReWooMark size={44} className="animate-pulse" />
            <span className="text-xs text-muted-foreground">Loading ReWoo…</span>
          </div>
        </div>
      );
    case "setup":
      return (
        <SetupRequiredView
          status={setupStatus}
          onRetry={() => void boot()}
          onBack={() => setStage("landing")}
        />
      );
    case "landing":
      return (
        <Landing
          setupRequired={!!setupStatus?.setupRequired}
          onStart={() => {
            if (setupStatus?.setupRequired) startLocal();
            else setStage("auth");
          }}
          onSignIn={() => setStage("auth")}
          onOpenSetup={() => setStage("setup")}
        />
      );
    case "auth":
      return (
        <AuthView
          onDone={enterCloud}
          onBack={() => setStage("landing")}
          onSetupRequired={() => void boot()}
        />
      );
    case "workspace": {
      const { user, mode } = useReWoo.getState();
      if (mode === "cloud" && !user) {
        // Session vanished (e.g. after sign-out) — fall back to landing.
        return <Landing setupRequired={false} onStart={() => setStage("auth")} onSignIn={() => setStage("auth")} onOpenSetup={() => void boot()} />;
      }
      return (
        <Workspace
          user={mode === "cloud" ? user : null}
          mode={mode}
          onSignedOut={exitWorkspace}
          onOpenSetup={() => setStage("setup")}
        />
      );
    }
  }
}
