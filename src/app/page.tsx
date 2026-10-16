"use client";

import { useEffect, useState } from "react";
import { api, type SessionUser } from "@/lib/rewoo-client";
import { useReWoo } from "@/lib/rewoo-store";
import { Landing } from "@/components/rewoo/landing";
import { AuthView } from "@/components/rewoo/auth-view";
import { Workspace } from "@/components/rewoo/workspace";

type Stage = "loading" | "landing" | "auth" | "workspace";

export default function Home() {
  const [stage, setStage] = useState<Stage>("loading");
  const { setUser } = useReWoo();

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
              R
            </span>
            <span className="text-xs text-muted-foreground">Loading ReWoo…</span>
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
