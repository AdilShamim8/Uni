"use client";

import { create } from "zustand";
import type { HealthInfo, SessionUser } from "@/lib/rewoo-client";

export type WorkspaceView =
  | "chat"
  | "models"
  | "settings"
  | "agents"
  | "work"
  | "research"
  | "automations"
  | "knowledge"
  | "skills"
  | "integrations"
  | "activity";

/**
 * Cloud mode: server-backed accounts, encrypted key vault, synced history.
 * Local mode: everything lives in this browser (no database required) —
 * used when the deployment has no DATABASE_URL configured yet.
 */
export type WorkspaceMode = "cloud" | "local";

interface ReWooState {
  user: SessionUser | null;
  mode: WorkspaceMode;
  /** deployment health — non-null only when the server needs setup */
  setupInfo: HealthInfo | null;
  view: WorkspaceView;
  /** null = follow viewport (expanded on desktop, drawer-closed on mobile) */
  sidebarOpen: boolean | null;
  activeConversationId: string | null;
  /** provider credential id (cloud) or local key id (local mode) */
  selectedCredentialId: string | null;
  selectedModel: string | null;
  setUser: (u: SessionUser | null) => void;
  setMode: (mode: WorkspaceMode) => void;
  setSetupInfo: (info: HealthInfo | null) => void;
  setView: (v: WorkspaceView) => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveConversation: (id: string | null) => void;
  setSelection: (credentialId: string | null, model: string | null) => void;
}

export const useReWoo = create<ReWooState>((set) => ({
  user: null,
  mode: "cloud",
  setupInfo: null,
  view: "chat",
  sidebarOpen: null,
  activeConversationId: null,
  selectedCredentialId: null,
  selectedModel: null,
  setUser: (user) => set({ user }),
  setMode: (mode) => set({ mode }),
  setSetupInfo: (setupInfo) => set({ setupInfo }),
  setView: (view) => set({ view }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setActiveConversation: (activeConversationId) => set({ activeConversationId }),
  setSelection: (selectedCredentialId, selectedModel) =>
    set({ selectedCredentialId, selectedModel }),
}));
