import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const HUB_BASE = process.env.PULSE_HUB_URL ?? "http://127.0.0.1:8081";
const HUB_TIMEOUT_MS = 800;
const WARN_DEDUP_MS = 30_000;
let lastHubWarn = 0;

function warnHubDegrade(path: string, reason: string) {
  const now = Date.now();
  if (now - lastHubWarn < WARN_DEDUP_MS) return;
  lastHubWarn = now;
  process.stderr.write(
    `[pulse-mcp] hub ${path} unavailable (${reason.slice(0, 60)}), falling back to upstream\n`,
  );
}

export async function hubFetch<T>(path: string): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HUB_TIMEOUT_MS);
  try {
    const res = await fetch(`${HUB_BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) {
      warnHubDegrade(path, `HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    warnHubDegrade(path, (err as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export const text = (s: string) => ({
  content: [{ type: "text" as const, text: s }],
});

export type RegisterFn = (server: McpServer) => void;
