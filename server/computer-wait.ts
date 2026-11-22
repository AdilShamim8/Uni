export interface ComputerHolder {
  name: string;
  task?: string;
}

import { conversationLanguage, serverLine } from "./server-lines.ts";

const minutes = (ms: number, language?: string): string => {
  const value = ms >= 60_000 ? Math.round(ms / 60_000) : Math.round(ms / 1000);
  const unit = ms >= 60_000 ? serverLine(language, "server.computerWait.minute") : serverLine(language, "server.computerWait.second");
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
};

export function computerWaitDuration(ms: number, language?: string): string {
  return ms < 1_000 ? serverLine(language, "server.computerWait.underASecond") : minutes(ms, language);
}

const holderPhrase = (holder: ComputerHolder, language?: string, still = false): string =>
  holder.task
    ? serverLine(language, still ? "server.computerWait.stillRunning" : "server.computerWait.running", { name: holder.name, task: holder.task })
    : serverLine(language, still ? "server.computerWait.stillUsing" : "server.computerWait.using", { name: holder.name });

export interface WaitQueueFact {
  position?: number;
  estimateMs?: number;
}

const ordinal = (position: number): string => {
  const mod100 = position % 100;
  const mod10 = position % 10;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th";
  return `${position}${suffix}`;
};

export function computerWaitingText(holder?: ComputerHolder | null, queue?: WaitQueueFact, threadId?: string): string {
  const language = threadId === undefined ? undefined : conversationLanguage(threadId);
  const position = queue?.position && queue.position > 0 ? queue.position : undefined;
  const place = position ? serverLine(language, "server.computerWait.inQueue", { position: ordinal(position) }) : "";
  const estimate = queue?.estimateMs !== undefined ? serverLine(language, "server.computerWait.recentWaits", { duration: computerWaitDuration(queue.estimateMs, language) }) : "";
  // Behind more than the holder: the freed seat goes to the front waiter first.
  const starts = position && position > 1
    ? serverLine(language, "server.computerWait.startsTurns")
    : holder
      ? serverLine(language, "server.computerWait.startsThat")
      : serverLine(language, "server.computerWait.startsFree");
  if (!holder) return serverLine(language, "server.computerWait.waiting", { place, starts, estimate });
  return serverLine(language, "server.computerWait.waitingHolder", { place, holder: holderPhrase(holder, language), starts, estimate });
}

export function computerFreeAfterText(holder: ComputerHolder | null | undefined, waitedMs: number, threadId?: string): string {
  const language = threadId === undefined ? undefined : conversationLanguage(threadId);
  const who = holder ? serverLine(language, "server.computerWait.heldBy", { who: holder.task ? `${holder.name} · ${holder.task}` : holder.name }) : "";
  return serverLine(language, "server.computerWait.free", { duration: computerWaitDuration(waitedMs, language), who });
}

export function computerStoppedWaitingText(holder: ComputerHolder | null | undefined, waitedMs: number, threadId?: string): string {
  const language = threadId === undefined ? undefined : conversationLanguage(threadId);
  const who = holder ? ` — ${holderPhrase(holder, language)}` : "";
  return serverLine(language, "server.computerWait.stopped", { duration: computerWaitDuration(waitedMs, language), who });
}

export function computerParkedText(holder: ComputerHolder | null | undefined, ceilingMs: number, threadId?: string): string {
  const language = threadId === undefined ? undefined : conversationLanguage(threadId);
  const who = holder ? ` — ${holderPhrase(holder, language, true)}` : "";
  return serverLine(language, "server.computerWait.parked", { ceiling: minutes(ceilingMs, language), who });
}

export function computerPersonAwayText(ceilingMs: number, threadId?: string): string {
  const language = threadId === undefined ? undefined : conversationLanguage(threadId);
  return serverLine(language, "server.computerWait.personAway", { ceiling: minutes(ceilingMs, language) });
}
