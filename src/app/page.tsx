"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type HealthInfo, type SessionUser } from "@/lib/rewoo-client";
import { useReWoo } from "@/lib/rewoo-store";
import { Landing } from "@/components/rewoo/landing";
import { AuthView } from "@/components/rewoo/auth-view";
import { Workspace } from "@/components/rewoo/workspace";
import { SetupRequiredView } from "@/components/rewoo/setup-view";

type Stage = "loading" | "landing" | "auth" | "workspace" | "setup";

export default function Home() {
  const [stage, setStage] = useState<Stage>("loading");
  const [setupStatus, setSetupStatus] = useState<HealthInfo | null>(null);
  const { setUser } = useReWoo();

  /**
   * Boot sequence: check deployment health and session in parallel.
   * A misconfigured deployment (no/invalid DATABASE_URL, missing master key)
   * renders the setup screen instead of a workspace that fails opaquely.
   */
  const boot = useCallback(async () => {
    setStage("loading");
    const [meRes, health] = await Promise.all([
      api.me().catch(() => ({ user: null as SessionUser | null })),
      api.health(),
    ]);
    if (health?.setupRequired) {
      setSetupStatus(health);
      setStage("setup");
      return;
    }
    const user = meRes.user;
    setUser(user);
    setStage(user ? "workspace" : "landing");
  }, [setUser]);

  useEffect(() => {
    void boot();
  }, [boot]);

  switch (stage) {
    case "loading":
      return (
        <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading">
          <div className="flex flex-col items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground" aria-hidden="true">
              R
            </span>
            <span className="text-xs text-muted-foreground">Loading ReWoo…</span>
          </div>
        </div>
      );
    case "setup":
      return <SetupRequiredView status={setupStatus} onRetry={() => void boot()} />;
    case "landing":
      return (
        <Landing
          onStart={() => setStage("auth")}
          onSignIn={() => setStage("auth")}
        />
      );
    case "auth":
      return (
        <AuthView
          onDone={(user) => {
            setUser(user);
            setStage("workspace");
          }}
          onBack={() => setStage("landing")}
          onSetupRequired={() => void boot()}
        />
      );
    case "workspace": {
      const user = useReWoo.getState().user;
      if (!user) {
        setStage("landing");
        return null;
      }
      return (
        <Workspace
          user={user}
          onSignedOut={() => {
            setUser(null);
            setStage("landing");
          }}
        />
      );
    }
  }
}
