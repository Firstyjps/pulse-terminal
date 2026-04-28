// Packs the Pulse Terminal MCP into a single .dxt (zip) — manifest.json + dist/index.mjs.
// Run after `pnpm build` so dist/index.mjs exists.

import AdmZip from "adm-zip";
import { existsSync, statSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "pulse-terminal.dxt");

if (!existsSync(join(ROOT, "dist/index.mjs"))) {
  console.error("dist/index.mjs missing — run `pnpm build` first.");
  process.exit(1);
}
if (!existsSync(join(ROOT, "manifest.json"))) {
  console.error("manifest.json missing.");
  process.exit(1);
}

if (existsSync(OUT)) rmSync(OUT);

const zip = new AdmZip();
zip.addLocalFile(join(ROOT, "manifest.json"));
zip.addLocalFile(join(ROOT, "dist/index.mjs"), "dist");
zip.writeZip(OUT);

const size = statSync(OUT).size;
console.log(`✓ packed → ${OUT}`);
console.log(`  ${(size / 1024).toFixed(1)} KB`);

const m = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
console.log(`  name: ${m.name} v${m.version}`);
console.log(`  tools: ${m.tools?.length ?? 0}`);

console.log("\n  archive contents:");
zip.getEntries().forEach((e) => {
  console.log(`    ${e.entryName}  (${e.header.size} bytes)`);
});
