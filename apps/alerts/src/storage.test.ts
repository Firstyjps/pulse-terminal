import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdir } from "node:fs/promises";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AlertStore, type ScanRecord } from "./storage.js";

let tmpDir: string;
let logPath: string;

const rec = (scanId: string): ScanRecord => ({
  ts: "2026-05-06T00:00:00.000Z",
  scan_id: scanId,
  symbol: "BTCUSDT",
  findings: [],
  marker: { btcPrice: 80_000 },
});

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "alerts-store-test-"));
  logPath = join(tmpDir, "alerts.jsonl");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("AlertStore", () => {
  it("dedupes by scan_id", async () => {
    const store = new AlertStore(logPath);
    await expect(store.append(rec("same"))).resolves.toBe(true);
    await expect(store.append(rec("same"))).resolves.toBe(false);
    expect(await store.readAll()).toHaveLength(1);
  });

  it("rotates when the next append would exceed maxBytes", async () => {
    writeFileSync(logPath, `${JSON.stringify(rec("old"))}\n`, "utf8");
    const store = new AlertStore(logPath, { maxBytes: 20, maxArchives: 2 });

    await expect(store.append(rec("new"))).resolves.toBe(true);

    const current = readFileSync(logPath, "utf8");
    expect(current).toContain('"scan_id":"new"');
    const archives = await readdir(tmpDir);
    expect(archives.some((name) => name.startsWith("alerts.jsonl."))).toBe(true);
  });

  it("prunes old archives after rotation", async () => {
    writeFileSync(logPath, `${JSON.stringify(rec("old"))}\n`, "utf8");
    writeFileSync(join(tmpDir, "alerts.jsonl.2026-01-01T00-00-00-000Z"), "a\n", "utf8");
    writeFileSync(join(tmpDir, "alerts.jsonl.2026-01-02T00-00-00-000Z"), "b\n", "utf8");
    const store = new AlertStore(logPath, { maxBytes: 20, maxArchives: 1 });

    await store.append(rec("new"));

    const names = await readdir(tmpDir);
    const archives = names.filter((name) => name.startsWith("alerts.jsonl."));
    expect(archives).toHaveLength(1);
  });
});
