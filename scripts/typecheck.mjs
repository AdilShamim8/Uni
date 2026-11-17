#!/usr/bin/env node
// Sequential typecheck: TS 7's native compiler holds the whole program graph
// in memory; this host (4 GB) OOMs when the three projects run in one process
// chain, so each project gets its own process, weakest first.
import { spawnSync } from "node:child_process";

const projects = [
  ["phone-protocol", ["tsc", "-p", "packages/phone-protocol/tsconfig.json"]],
  ["server", ["tsc", "-p", "tsconfig.server.json"]],
  ["app", ["tsc", "-b"]],
];
let failed = 0;
for (const [name, command] of projects) {
  console.log(`typecheck: ${name}`);
  const run = spawnSync(command[0], command.slice(1), { stdio: "inherit", shell: true });
  if (run.status !== 0) {
    failed = run.status ?? 1;
    console.error(`typecheck: ${name} failed (${failed})`);
    break;
  }
}
process.exit(failed);
