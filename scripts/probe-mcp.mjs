#!/usr/bin/env node
/**
 * Spawn the MCP server via stdio, send `initialize` + `tools/list`, then
 * optionally invoke a single tool via `tools/call`. Used by the smoke pass —
 * proves the server boots and exposes the expected toolset, and lets us
 * exercise individual tool handlers without Claude Desktop in the loop.
 *
 * Usage:
 *   node scripts/probe-mcp.mjs                # list tools
 *   node scripts/probe-mcp.mjs <tool> [json]  # call <tool> with optional JSON args
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcpEntry = path.join(repoRoot, "apps/mcp/src/index.ts");
const tsxLoader =
  "file://" +
  path
    .join(repoRoot, "apps/realtime/node_modules/tsx/dist/loader.mjs")
    .replace(/\\/g, "/");

const child = spawn(
  process.execPath,
  ["--import", tsxLoader, mcpEntry],
  { stdio: ["pipe", "pipe", "inherit"], cwd: repoRoot },
);

let buf = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error("[probe] non-JSON line:", line);
      continue;
    }
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params, timeoutMs = 15_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) => (msg.error ? reject(msg.error) : resolve(msg.result)));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, timeoutMs);
  });
}

const [, , toolName, argsJson] = process.argv;

try {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "probe-mcp", version: "0.0.0" },
  });
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
  );

  if (!toolName) {
    const list = await rpc("tools/list", {});
    const names = (list?.tools ?? []).map((t) => t.name);
    console.log(`COUNT=${names.length}`);
    console.log("TOOLS=" + names.join(","));
  } else {
    const args = argsJson ? JSON.parse(argsJson) : {};
    const result = await rpc("tools/call", { name: toolName, arguments: args }, 30_000);
    // MCP wraps results in {content:[{type:"text",text:"..."}]}
    const text = result?.content?.[0]?.text ?? JSON.stringify(result);
    console.log(text);
  }

  child.kill();
  process.exit(0);
} catch (err) {
  console.error("[probe] failed:", err);
  child.kill();
  process.exit(1);
}
