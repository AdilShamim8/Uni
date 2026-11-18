#!/usr/bin/env node
// Typecheck every project, on any host.
//
// Two paths, same compiler rules (strict, noEmit, stop at the first failing
// project):
//
// - UNI_TYPECHECK=direct (or a roomy host, >= 8 GB): the original chained
//   command — `tsc -p` for phone-protocol and the server program, `tsc -b`
//   for the app — in one process each. This is what CI runs.
// - UNI_TYPECHECK=chunked (or a small host): the server program (~12k files)
//   is split into per-subdirectory and root-file chunks, each its own
//   compiler process, because a 4 GB host without swap OOMs the single
//   process before diagnostics.
//
// The open-source edition deletes enterprise/ before typechecking
// (LICENSING.md promises a working OSS edition without it), so a chunk whose
// directory is absent is skipped; tsconfig.server.json names enterprise/
// only through its include list, so the base config itself stays valid.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { totalmem } from "node:os";

const root = join(import.meta.dirname, "..");
const chunksDir = join(import.meta.dirname, "typecheck-chunks");
mkdirSync(chunksDir, { recursive: true });
const heapMb = Math.min(Math.max(Math.floor(totalmem() / 2 / 1024 / 1024), 2048), 6144);

function run(command, args, label) {
  process.stdout.write(`typecheck: ${label} ... `);
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${heapMb}`.trim() },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const ok = result.status === 0;
  console.log(ok ? "ok" : `FAILED (${result.status ?? "signal"})`);
  return ok;
}

function direct() {
  return (
    run("node_modules/.bin/tsc", ["-p", "packages/phone-protocol/tsconfig.json", "--noEmit"], "phone-protocol") &&
    run("node_modules/.bin/tsc", ["-p", "tsconfig.server.json", "--noEmit"], "server") &&
    run("node_modules/.bin/tsc", ["-b", "tsconfig.json"], "app")
  );
}

function serverSubdirs() {
  const dir = join(root, "server");
  return readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory() && name !== "fixtures")
    .sort();
}

/** The root-level server files typecheck as explicit quarters; TypeScript's
 * include globs support neither character classes nor a brace list this long. */
function rootQuarters() {
  const dir = join(root, "server");
  const files = readdirSync(dir).filter((name) => name.endsWith(".ts")).sort();
  const size = Math.ceil(files.length / 4);
  return [0, 1, 2, 3]
    .map((i) => files.slice(i * size, (i + 1) * size))
    .filter((group) => group.length > 0)
    .map((group, i) => ({ name: `${i + 1}-of-4`, files: group.map((f) => `../../server/${f}`) }));
}

function chunked() {
  const hasTsInputs = (dir) =>
    readdirSync(dir, { withFileTypes: true }).some(
      (e) => (e.isFile() && /\.(ts|tsx)$/.test(e.name)) || (e.isDirectory() && hasTsInputs(join(dir, e.name))),
    );
  const appChunksFor = (dir, inheritedAmbient = []) => {
    const files = readdirSync(join(root, dir)).filter((name) => /\.(ts|tsx)$/.test(name)).sort();
    // Ambient declarations (e.g. src/novnc.d.ts's module mapping) must ride along
    // with every chunk that imports what they declare — a chunk that includes only
    // its own files never loads the parent's .d.ts, the import falls through to
    // @types, and resolution fails (TS2306). They are small; every chunk carries
    // the ambient files of every directory above it.
    const ambient = [...new Set([...inheritedAmbient, ...readdirSync(join(root, dir)).filter((name) => name.endsWith(".d.ts")).map((f) => `../../${dir}/${f}`)])];
    const subdirs = readdirSync(join(root, dir), { withFileTypes: true })
      .filter((e) => e.isDirectory() && hasTsInputs(join(root, dir, e.name)))
      .map((e) => {
        const inner = join(root, dir, e.name);
        const innerFiles = readdirSync(inner).filter((n) => /\.(ts|tsx)$/.test(n)).length;
        // A directory with hundreds of root files (src/components has ~990) still OOMs a small
        // host as one program; recurse so its root files typecheck as halves, like the server quarters.
        return innerFiles > 450 ? appChunksFor(`${dir}/${e.name}`, ambient) : [{ name: `${dir}/${e.name}`, include: [...srcAmbient, `../../${dir}/${e.name}`], app: true }];
      })
      .flat()
      .sort((a, b) => a.name.localeCompare(b.name));
    const halves = Math.max(1, Math.ceil(files.length / 450));
    const name = (i) => `${dir}-root-${i + 1}-of-${halves}`;
    return [
      ...subdirs,
      ...Array.from({ length: halves }, (_, i) => ({
        name: name(i),
        include: [...srcAmbient, ...files.slice(i * Math.ceil(files.length / halves), (i + 1) * Math.ceil(files.length / halves)).map((f) => `../../${dir}/${f}`)],
        app: true,
      })).filter((chunk) => chunk.include.length > 0),
    ];
  };
  // Direct mode's include: ["src"] loads every ambient declaration under src/
  // (src/novnc.d.ts, src/types/ogb.d.ts). A chunk that includes only its own
  // files would resolve @novnc/novnc against @types (TS2306) and miss
  // Window.ogb (TS2339), so every app chunk carries all of them.
  const srcAmbient = (function collect(dir) {
    const out = readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? collect(`${dir}/${e.name}`) : e.name.endsWith(".d.ts") ? [`../../${dir}/${e.name}`] : []);
    return readdirSync(join(root, dir)).filter((n) => n.endsWith(".d.ts")).map((f) => `../../${dir}/${f}`).concat(out);
  })("src");
  const chunks = [
    { name: "phone-protocol", config: "packages/phone-protocol/tsconfig.json" },
    { name: "companion", dir: "companion" },
    { name: "connector", dir: "connector" },
    { name: "enterprise", dir: "enterprise" },
    ...serverSubdirs().map((name) => ({ name: `server-${name}`, dir: `server/${name}` })),
    ...rootQuarters().map((quarter) => ({ name: `server-root-${quarter.name}`, include: quarter.files })),
    { name: "app-vite-config", include: ["../../vite.config.ts"], app: true },
    ...appChunksFor("src"),
  ];
  let ok = true;
  for (const chunk of chunks) {
    if (chunk.dir && !existsSync(join(root, chunk.dir))) {
      console.log(`typecheck: ${chunk.name} ... absent (skipped)`);
      continue;
    }
    if (chunk.config) {
      ok = run("node_modules/.bin/tsc6", ["-p", join(root, chunk.config), "--noEmit"], chunk.name);
    } else {
      const file = join(chunksDir, `tsconfig.${chunk.name.replaceAll("/", "__")}.json`);
      const base = chunk.app ? "../../tsconfig.json" : "../../tsconfig.server.json";
      writeFileSync(file, `${JSON.stringify({ extends: base, include: chunk.include ?? [`../../${chunk.dir}`] }, null, 2)}\n`);
      ok = run("node_modules/.bin/tsc6", ["-p", file, "--noEmit"], chunk.name);
    }
    if (!ok) break;
  }
  rmSync(chunksDir, { recursive: true, force: true });
  return ok;
}

const mode = process.env.UNI_TYPECHECK ?? (totalmem() >= 8 * 1024 ** 3 ? "direct" : "chunked");
const ok = mode === "direct" ? direct() : chunked();
if (!ok) process.exit(1);
