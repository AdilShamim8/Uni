// The words a recovered goal-run row shows for its state, in the conversation's language. Kept beside the
// store's recovery path; the store itself stays within its file-size ratchet.
import { serverLine } from "./server-lines.ts";

export function goalStateWords(status: string, language: string | undefined): string {
  if (status === "needs-input") return serverLine(language, "server.goal.needsInput");
  if (status === "limit-reached") return serverLine(language, "server.goal.limitReached");
  return status;
}
