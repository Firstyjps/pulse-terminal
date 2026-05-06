import { appendFile, mkdir, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export interface ScanRecord {
  ts: string;
  scan_id: string;
  symbol: string;
  findings: Array<{
    category: string;
    severity: "low" | "med" | "high";
    signal: string;
    evidence: Record<string, unknown>;
  }>;
  /** Price snapshot at scan time — used by backtest to score outcomes later. */
  marker: { btcPrice?: number; ethPrice?: number };
  sent_webhook?: boolean;
}

export interface AlertStoreOptions {
  maxBytes?: number;
  maxArchives?: number;
  dedupeScanIds?: boolean;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_ARCHIVES = 5;

export class AlertStore {
  constructor(private path: string, private options: AlertStoreOptions = {}) {}

  async ensure() {
    await mkdir(dirname(this.path), { recursive: true });
  }

  async append(rec: ScanRecord): Promise<boolean> {
    await this.ensure();
    const line = JSON.stringify(rec) + "\n";
    if (this.options.dedupeScanIds !== false && await this.hasScanId(rec.scan_id)) {
      return false;
    }
    await this.rotateIfNeeded(Buffer.byteLength(line));
    await appendFile(this.path, line, "utf8");
    return true;
  }

  async readAll(): Promise<ScanRecord[]> {
    try {
      const txt = await readFile(this.path, "utf8");
      return txt
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as ScanRecord);
    } catch {
      return [];
    }
  }

  private async hasScanId(scanId: string): Promise<boolean> {
    if (!scanId) return false;
    try {
      const txt = await readFile(this.path, "utf8");
      return txt.includes(`"scan_id":"${scanId}"`);
    } catch {
      return false;
    }
  }

  private async rotateIfNeeded(nextBytes: number): Promise<void> {
    const maxBytes = this.options.maxBytes ?? Number(process.env.ALERT_LOG_MAX_BYTES ?? DEFAULT_MAX_BYTES);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) return;

    try {
      const s = await stat(this.path);
      if (s.size + nextBytes <= maxBytes) return;
    } catch {
      return;
    }

    const dir = dirname(this.path);
    const base = basename(this.path);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await rename(this.path, resolve(dir, `${base}.${stamp}`));
    await this.pruneArchives();
  }

  private async pruneArchives(): Promise<void> {
    const maxArchives = this.options.maxArchives ?? Number(process.env.ALERT_LOG_MAX_ARCHIVES ?? DEFAULT_MAX_ARCHIVES);
    if (!Number.isFinite(maxArchives) || maxArchives < 0) return;

    const dir = dirname(this.path);
    const base = basename(this.path);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }

    const archives = names
      .filter((name) => name.startsWith(`${base}.`))
      .sort()
      .reverse();

    await Promise.all(
      archives.slice(maxArchives).map((name) => unlink(resolve(dir, name)).catch(() => undefined)),
    );
  }
}
