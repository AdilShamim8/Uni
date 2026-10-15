"use client";

import { useEffect, useState } from "react";
import { api, type SessionUser } from "@/lib/you-client";
import { useYou } from "@/lib/you-store";
import { Landing } from "@/components/you/landing";
import { AuthView } from "@/components/you/auth-view";
import { Workspace } from "@/components/you/workspace";

type Stage = "loading" | "landing" | "auth" | "workspace";

export default function Home() {
  const [stage, setStage] = useState<Stage>("loading");
  const { setUser } = useYou();

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(({ user }) => {
        if (cancelled) return;
        setUser(user);
        setStage(user ? "workspace" : "landing");
      })
      .catch(() => {
        if (!cancelled) setStage("landing");
      });
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  switch (stage) {
    case "loading":
      return (
        <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading">
          <div className="flex flex-col items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground" aria-hidden="true">
              Y
            </span>
            <span className="text-xs text-muted-foreground">Loading YOU…</span>
          </div>
        </div>
      );
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
        />
      );
    case "workspace": {
      const user = useYou.getState().user;
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
