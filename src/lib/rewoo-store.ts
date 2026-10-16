"use client";

import { create } from "zustand";
import type { SessionUser } from "@/lib/rewoo-client";

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

interface ReWooState {
  user: SessionUser | null;
  view: WorkspaceView;
  sidebarOpen: boolean;
  activeConversationId: string | null;
  /** provider label + model snapshot selected in the composer */
  selectedCredentialId: string | null;
  selectedModel: string | null;
  setUser: (u: SessionUser | null) => void;
  setView: (v: WorkspaceView) => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveConversation: (id: string | null) => void;
  setSelection: (credentialId: string | null, model: string | null) => void;
}

export const useReWoo = create<ReWooState>((set) => ({
  user: null,
  view: "chat",
  sidebarOpen: false,
  activeConversationId: null,
  selectedCredentialId: null,
  selectedModel: null,
  setUser: (user) => set({ user }),
  setView: (view) => set({ view }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setActiveConversation: (activeConversationId) => set({ activeConversationId }),
  setSelection: (selectedCredentialId, selectedModel) =>
    set({ selectedCredentialId, selectedModel }),
}));
