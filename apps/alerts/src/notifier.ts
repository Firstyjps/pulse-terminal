import type { ScanRecord } from "./storage.js";

const SEV_RANK = { low: 0, med: 1, high: 2 } as const;

export class Notifier {
  constructor(
    private webhookUrl: string | undefined,
    private minSeverity: "low" | "med" | "high",
  ) {}

  async maybeNotify(rec: ScanRecord): Promise<boolean> {
    const minRank = SEV_RANK[this.minSeverity];
    const eligible = rec.findings.filter((f) => SEV_RANK[f.severity] >= minRank);
    if (!eligible.length) return false;

    const summary = eligible
      .map((f) => `**[${f.severity.toUpperCase()}]** ${f.signal}`)
      .join("\n");

    // Always log to stdout
    console.log(`\n[alerts] ${rec.ts} — ${eligible.length} finding(s):\n${summary}\n`);

    if (!this.webhookUrl) return false;

    try {
      await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Discord-compatible. Slack works too with `text` field.
          content: `**Pulse Terminal Alert · ${rec.symbol}**\n${summary}`,
          text: `Pulse Terminal Alert (${rec.symbol}):\n${summary}`,
          username: "Pulse Terminal",
        }),
      });
      return true;
    } catch (err) {
      console.warn("[alerts] webhook failed:", (err as Error).message);
      return false;
    }
  }
}
