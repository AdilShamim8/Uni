// Collects the full license text of every production npm package that can end up in the
// built web app (dist/) and writes public/THIRD_PARTY_LICENSES.txt (copied into dist on build).
// Run: node scripts/collect-licenses.mjs   (also runs automatically before `npm run build`)
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const pkgs = Object.entries(lock.packages || {})
  .filter(([p, meta]) => p.startsWith("node_modules/") && !meta.dev && !meta.devOptional)
  .map(([p, meta]) => ({ dir: path.join(root, p), name: p.split("node_modules/").pop(), version: meta.version, license: meta.license }))
  .sort((a, b) => a.name.localeCompare(b.name));

const out = [
  "Third-party software bundled in the ReWoo web app",
  "===================================================",
  "",
  "The compiled JavaScript/CSS in this folder includes code from the packages below.",
  "Each package's license text is reproduced in full.",
  "",
];
const missing = [];
for (const p of pkgs) {
  const file = fs.existsSync(p.dir) && fs.readdirSync(p.dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  out.push("-".repeat(78), `${p.name}@${p.version}  —  ${p.license || "see text"}`, "-".repeat(78));
  if (file) out.push(fs.readFileSync(path.join(p.dir, file), "utf8").trim());
  else { out.push(`License: ${p.license || "UNKNOWN"} (no license file shipped in the package)`); missing.push(p.name); }
  out.push("");
}
fs.mkdirSync(path.join(root, "public"), { recursive: true });
fs.writeFileSync(path.join(root, "public", "THIRD_PARTY_LICENSES.txt"), out.join("\n"));
const licenses = [...new Set(pkgs.map((p) => p.license))];
console.log(`Wrote licenses for ${pkgs.length} packages (${licenses.join(", ")}). Without license file: ${missing.join(", ") || "none"}`);
const bad = pkgs.filter((p) => !/^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|Apache-2.0|0BSD|MIT-0|CC0-1.0|Unlicense)$/.test(p.license || ""));
if (bad.length) { console.error("Non-permissive or unknown licenses:", bad.map((p) => `${p.name}:${p.license}`)); process.exit(1); }
