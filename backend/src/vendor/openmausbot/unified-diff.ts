// Extracted from OpenMausBot (https://github.com/milind-soni/OpenMausBot) at
// commit 0d8eacc65cd3b783a0d28d019d39e6367780b911, path server/memory-journal.ts.
// Upstream Apache-2.0 license: third_party/licenses/openmausbot/LICENSE
// Upstream notice: third_party/licenses/openmausbot/UPSTREAM_NOTICE
// Local provenance and integrity hash: third_party/sources.lock.json
// Modifications: extraction only — the pure unified-diff engine (`Op`,
// `editScript`, `splitLines`, `unifiedDiff`, `DIFF_CAP`, `UnifiedDiff`) was
// lifted verbatim out of the upstream file's file-journal module; the
// surrounding journal/appending logic is reimplemented for PostgreSQL in
// backend/src/modules/memory. Type-level only change: indexed accesses on
// `ops`/`changes`/`a`/`b` gained non-null assertions because Uni's tsconfig
// enables noUncheckedIndexedAccess (upstream's does not). No behavioural
// change to the extracted code.

export const DIFF_CAP = 8_000;

type Op = { tag: " " | "-" | "+"; line: string };

function editScript(fullA: string[], fullB: string[]): Op[] {
  if (fullA.length * fullB.length > 4_000_000) {
    return [...fullA.map((line) => ({ tag: "-" as const, line })), ...fullB.map((line) => ({ tag: "+" as const, line }))];
  }
  let shared = 0;
  while (shared < fullA.length && shared < fullB.length && fullA[shared] === fullB[shared]) shared++;
  const ops: Op[] = fullA.slice(0, shared).map((line) => ({ tag: " " as const, line }));
  const a = fullA.slice(shared);
  const b = fullB.slice(shared);
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j]
        ? table[(i + 1) * cols + j + 1]! + 1
        : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ tag: " ", line: a[i]! });
      i++;
      j++;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) {
      ops.push({ tag: "-", line: a[i++]! });
    } else {
      ops.push({ tag: "+", line: b[j++]! });
    }
  }
  while (i < a.length) ops.push({ tag: "-", line: a[i++]! });
  while (j < b.length) ops.push({ tag: "+", line: b[j++]! });
  return ops;
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export interface UnifiedDiff {
  text: string;
  added: number;
  removed: number;
  truncated: boolean;
}

export function unifiedDiff(before: string, after: string, path: string, cap = DIFF_CAP): UnifiedDiff {
  if (before === after) return { text: "", added: 0, removed: 0, truncated: false };
  const ops = editScript(splitLines(before), splitLines(after));
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.tag === "+") added++;
    else if (op.tag === "-") removed++;
  }
  const changes: number[] = [];
  ops.forEach((op, k) => {
    if (op.tag !== " ") changes.push(k);
  });
  const hunks: Array<{ start: number; end: number }> = [];
  let index = 0;
  while (index < changes.length) {
    let lastChange = changes[index]!;
    let next = index + 1;
    while (next < changes.length && changes[next]! - lastChange <= 2 * 2 + 1) lastChange = changes[next++]!;
    hunks.push({ start: Math.max(0, changes[index]! - 2), end: Math.min(ops.length - 1, lastChange + 2) });
    index = next;
  }
  const lines: string[] = [`--- a/${path}`, `+++ b/${path}`];
  let oldLine = 1;
  let newLine = 1;
  let cursor = 0;
  for (const hunk of hunks) {
    for (; cursor < hunk.start; cursor++) {
      if (ops[cursor]!.tag !== "+") oldLine++;
      if (ops[cursor]!.tag !== "-") newLine++;
    }
    const slice = ops.slice(hunk.start, hunk.end + 1);
    const oldCount = slice.filter((op) => op.tag !== "+").length;
    const newCount = slice.filter((op) => op.tag !== "-").length;
    // an empty side is conventionally anchored on the line before it
    lines.push(`@@ -${oldCount ? oldLine : oldLine - 1},${oldCount} +${newCount ? newLine : newLine - 1},${newCount} @@`);
    for (const op of slice) lines.push(`${op.tag}${op.line}`);
    for (; cursor <= hunk.end; cursor++) {
      if (ops[cursor]!.tag !== "+") oldLine++;
      if (ops[cursor]!.tag !== "-") newLine++;
    }
  }
  let text = lines.join("\n");
  let truncated = false;
  if (text.length > cap) {
    text = `${text.slice(0, cap)}\n… (diff cut here)`;
    truncated = true;
  }
  return { text, added, removed, truncated };
}
