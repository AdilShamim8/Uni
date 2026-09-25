import { describe, expect, it } from "vitest";
import { reduceTurn } from "../lib/turn";
import type { Ev } from "../lib/api";

const ev = (seq: number, type: string, data: any = {}): Ev => ({ task_id: "t", seq, type, data, created_at: 0 });

describe("reduceTurn", () => {
  it("builds a full turn from an event log", () => {
    const v = reduceTurn([
      ev(1, "started", { brain: "demo", on_device: true, agent: "woo" }),
      ev(2, "context", { used: [{ n: 1, kind: "document", title: "Lease", text: "rent", source: "My uploads" }], left_out: [{ title: "Med", reason: "private" }], secrets_hidden: 2 }),
      ev(3, "plan", { steps: ["Search", "Answer"] }),
      ev(4, "tool_started", { tool: "search_memory", label: "Searching", emoji: "🔎", input: { query: "rent" } }),
      ev(5, "tool_finished", { tool: "search_memory", ok: true, data: { found: 0 } }),
      ev(6, "answer_delta", { text: "Rent is " }),
      ev(7, "answer_delta", { text: "42,000 [1]" }),
      ev(8, "answer", { text: "Rent is 42,000 [1]" }),
      ev(9, "done", {}),
    ]);
    expect(v.status).toBe("done");
    expect(v.answer).toBe("Rent is 42,000 [1]");
    expect(v.used).toHaveLength(1);
    expect(v.secrets).toBe(2);
    expect(v.leftOut).toHaveLength(1);
    expect(v.toolsDone).toBe(1);
    expect(v.steps.find((s) => s.kind === "tool")?.detail).toContain("nothing new");
  });

  it("tracks approvals and ignores nested answer deltas", () => {
    const v = reduceTurn([
      ev(1, "approval_requested", { id: "a1", tool: "remember_fact", label: "Remembering", input: { fact: "x" } }),
      ev(2, "answer_delta", { text: "sub", depth: 1 }),
      ev(3, "approval_decided", { id: "a1", approved: false }),
    ]);
    expect(v.approvals[0].decided).toBe(true);
    expect(v.answer).toBe("");
    expect(v.steps[v.steps.length - 1]?.title).toContain("said no");
  });

  it("resets a streamed answer when the model switches to a tool", () => {
    const v = reduceTurn([ev(1, "answer_delta", { text: "draft" }), ev(2, "answer_reset", {})]);
    expect(v.answer).toBe("");
    expect(v.streaming).toBe(false);
  });
});
