#!/usr/bin/env node
// Chunked typecheck for memory-constrained hosts.
//
// tsconfig.server.json's one program (server + companion + enterprise +
// connector, ~12k files) needs more RAM than a 4 GB host can give a single
// compiler process. The chunks below cover the same files with the same
// compiler options (every chunk extends the same base config); each chunk is
// a separate compiler process. `server/` itself is still too large as one
// chunk, so it is covered by its subdirectories plus the root-level files.
//
// Same rules as the root config: strict, noEmit, stop at the first failing
// chunk. Larger hosts can still run the single-process command
// (`tsc -p tsconfig.server.json`) for an exact-equivalence check.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const chunksDir = join(import.meta.dirname, "typecheck-chunks");

function serverSubdirs() {
  const dir = join(root, "server");
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory() && name !== "fixtures")
    .sort();
}

/** The 1,783 root-level server files are still too many for one compiler
 * process on this host, so they typecheck as four explicit quarters;
 * TypeScript's include globs support neither character classes nor a brace
 * list this long. */
function rootQuarters() {
  const dir = join(root, "server");
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts")).sort();
  const size = Math.ceil(files.length / 4);
  return [0, 1, 2, 3]
    .map((i) => files.slice(i * size, (i + 1) * size))
    .filter((group) => group.length > 0)
    .map((group, i) => ({ name: `${i + 1}-of-4`, files: group.map((f) => `../../server/${f}`) }));
}

const chunks = [
  { name: "phone-protocol", config: "packages/phone-protocol/tsconfig.json" },
  { name: "companion", include: ["../../companion"] },
  { name: "connector", include: ["../../connector"] },
  { name: "enterprise", include: ["../../enterprise"] },
  ...serverSubdirs().map((name) => ({ name: `server-${name}`, include: [`../../server/${name}`] })),
  ...rootQuarters().map((quarter) => ({ name: `server-root-${quarter.name}`, include: quarter.files })),
  { name: "app", config: "tsconfig.json" },
];

let failed = 0;
for (const chunk of chunks) {
  let config = chunk.config && join(root, chunk.config);
  if (!config) {
    const file = join(chunksDir, `tsconfig.${chunk.name}.json`);
    writeFileSync(file, `${JSON.stringify({ extends: "../../tsconfig.server.json", include: chunk.include }, null, 2)}\n`);
    config = file;
  }
  process.stdout.write(`typecheck: ${chunk.name} ... `);
  const run = spawnSync("node_modules/.bin/tsc6", ["-p", config, "--noEmit"], {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=2800`.trim() },
    encoding: "utf8",
  });
  if (run.status === 0) {
    console.log("ok");
  } else {
    failed = run.status ?? 1;
    console.log(`FAILED (${failed})`);
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stdout.write(run.stderr);
    break;
  }
}
process.exit(failed);
