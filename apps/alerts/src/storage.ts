import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

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

export class AlertStore {
  constructor(private path: string) {}

  async ensure() {
    await mkdir(dirname(this.path), { recursive: true });
  }

  async append(rec: ScanRecord) {
    await this.ensure();
    await appendFile(this.path, JSON.stringify(rec) + "\n", "utf8");
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
}
