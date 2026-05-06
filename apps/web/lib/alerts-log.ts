import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function resolveAlertsLogPath(raw = process.env.ALERT_LOG_PATH): string {
  const repoRoot = findRepoRoot(process.cwd());
  if (!raw) return resolve(repoRoot, "apps/alerts/data/alerts.jsonl");
  if (isAbsolute(raw)) return raw;

  const normalized = raw.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("apps/alerts/")) return resolve(repoRoot, normalized);

  return resolve(process.cwd(), raw);
}
