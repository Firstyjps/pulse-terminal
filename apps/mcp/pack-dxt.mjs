// Packs the Pulse Terminal MCP into a single .dxt (zip).
// Run after `pnpm build` so the tsc-emitted dist/ tree exists.

import AdmZip from "adm-zip";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { existsSync, statSync, readFileSync, rmSync, readdirSync, realpathSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const OUT = join(ROOT, "pulse-terminal.dxt");
const MANIFEST = join(ROOT, "manifest.json");
const DIST = join(ROOT, "dist");
const SRC = join(ROOT, "src/index.ts");

if (!existsSync(MANIFEST)) {
  console.error("manifest.json missing.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const entryPoint = manifest.server?.entry_point ?? "dist/index.js";
const entryPath = join(ROOT, entryPoint);

if (!existsSync(DIST)) {
  console.error("dist/ missing — run `pnpm build` first.");
  process.exit(1);
}
if (!existsSync(entryPath)) {
  console.error(`${entryPoint} missing — run \`pnpm build\` first or update manifest.server.entry_point.`);
  process.exit(1);
}

await build({
  entryPoints: [SRC],
  outfile: entryPath,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["better-sqlite3"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "silent",
});

if (existsSync(OUT)) rmSync(OUT);

const zip = new AdmZip();
zip.addLocalFile(MANIFEST);
zip.addFile(
  "package.json",
  Buffer.from(`${JSON.stringify({ type: "module" }, null, 2)}\n`, "utf8"),
);

zip.addLocalFile(entryPath, dirname(entryPoint));

function addFolderToZip(sourceDir, zipDir) {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const fullPath = join(sourceDir, entry.name);
    const archiveDir = dirname(join(zipDir, relative(sourceDir, fullPath))).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      addFolderToZip(fullPath, join(zipDir, entry.name));
      continue;
    }
    if (entry.isFile()) zip.addLocalFile(fullPath, archiveDir);
  }
}

function addRuntimePackage(packageName, packageRoot) {
  const zipDir = `node_modules/${packageName}`;
  addFolderToZip(packageRoot, zipDir);
}

function resolveBetterSqliteRuntime() {
  const sourcesServer = require.resolve("@pulse/sources/server");
  const sourcesRoot = dirname(dirname(sourcesServer));
  const betterSqliteRoot = realpathSync(join(sourcesRoot, "node_modules/better-sqlite3"));
  const betterSqliteParent = dirname(betterSqliteRoot);
  const bindingsRoot = realpathSync(join(betterSqliteParent, "bindings"));
  const bindingsParent = dirname(bindingsRoot);
  const fileUriRoot = realpathSync(join(bindingsParent, "file-uri-to-path"));
  return { betterSqliteRoot, bindingsRoot, fileUriRoot };
}

const { betterSqliteRoot, bindingsRoot, fileUriRoot } = resolveBetterSqliteRuntime();
addRuntimePackage("better-sqlite3", betterSqliteRoot);
addRuntimePackage("bindings", bindingsRoot);
addRuntimePackage("file-uri-to-path", fileUriRoot);

function countPackagedBuiltJs(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) count += countPackagedBuiltJs(fullPath);
    if (entry.isFile() && entry.name.endsWith(".js")) count += 1;
  }
  return count;
}

zip.writeZip(OUT);

const size = statSync(OUT).size;
console.log(`✓ packed → ${OUT}`);
console.log(`  ${(size / 1024).toFixed(1)} KB`);

console.log(`  name: ${manifest.name} v${manifest.version}`);
console.log(`  entry: ${entryPoint}`);
console.log(`  tools: ${manifest.tools?.length ?? 0}`);
console.log(`  bundled runtime packages: better-sqlite3, bindings, file-uri-to-path`);
console.log(`  tsc js files present: ${countPackagedBuiltJs(DIST)}`);

console.log("\n  archive contents:");
zip.getEntries().forEach((e) => {
  console.log(`    ${e.entryName}  (${e.header.size} bytes)`);
});
