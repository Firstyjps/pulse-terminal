import type { ScanRecord } from "./storage.js";

const SEV_RANK = { low: 0, med: 1, high: 2 } as const;
type Severity = "low" | "med" | "high";

type NotifyChannel = {
  name: string;
  send: (rec: ScanRecord, summary: string) => Promise<void>;
};

/**
 * Multi-channel push: optional Discord/Slack webhook, ntfy.sh, and Telegram.
 * Each channel is opt-in via env. Failures on one channel don't block others.
 *
 *   PULSE_WEBHOOK_URL              — Discord/Slack webhook (legacy)
 *   PULSE_NTFY_TOPIC               — ntfy.sh topic ("https://ntfy.sh/<topic>")
 *                                   or full URL for self-hosted instance
 *   PULSE_NTFY_PRIORITY            — 1..5 (default 3 low, 4 med, 5 high)
 *   PULSE_TELEGRAM_BOT_TOKEN       — Telegram bot HTTP API token
 *   PULSE_TELEGRAM_CHAT_ID         — destination chat / channel id
 */
export class Notifier {
  private channels: NotifyChannel[];

  constructor(
    webhookUrl: string | undefined,
    private minSeverity: Severity,
  ) {
    this.channels = buildChannels(webhookUrl);
  }

  channelNames(): string[] {
    return this.channels.map((c) => c.name);
  }

  async maybeNotify(rec: ScanRecord): Promise<boolean> {
    const minRank = SEV_RANK[this.minSeverity];
    const eligible = rec.findings.filter((f) => SEV_RANK[f.severity] >= minRank);
    if (!eligible.length) return false;

    const summary = eligible
      .map((f) => `**[${f.severity.toUpperCase()}]** ${f.signal}`)
      .join("\n");

    // Always log to stdout
    console.log(`\n[alerts] ${rec.ts} — ${eligible.length} finding(s):\n${summary}\n`);

    if (!this.channels.length) return false;

    const results = await Promise.allSettled(
      this.channels.map((c) => c.send(rec, summary)),
    );

    let anyOk = false;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        anyOk = true;
      } else {
        console.warn(`[alerts] ${this.channels[i].name} failed:`, (r.reason as Error)?.message ?? r.reason);
      }
    });
    return anyOk;
  }
}

function buildChannels(webhookUrl: string | undefined): NotifyChannel[] {
  const channels: NotifyChannel[] = [];

  if (webhookUrl) {
    channels.push({
      name: "webhook",
      send: async (rec, summary) => {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Discord-compatible. Slack works too with `text` field.
            content: `**Pulse Terminal Alert · ${rec.symbol}**\n${summary}`,
            text: `Pulse Terminal Alert (${rec.symbol}):\n${summary}`,
            username: "Pulse Terminal",
          }),
        });
        if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
      },
    });
  }

  const ntfyTopic = process.env.PULSE_NTFY_TOPIC;
  if (ntfyTopic) {
    const ntfyUrl = ntfyTopic.startsWith("http")
      ? ntfyTopic
      : `https://ntfy.sh/${ntfyTopic}`;
    const priorityOverride = process.env.PULSE_NTFY_PRIORITY;
    channels.push({
      name: "ntfy",
      send: async (rec, summary) => {
        const topSeverity = highestSeverity(rec);
        const priority = priorityOverride
          ? priorityOverride
          : topSeverity === "high"
            ? "5"
            : topSeverity === "med"
              ? "4"
              : "3";
        const res = await fetch(ntfyUrl, {
          method: "POST",
          headers: {
            "Title": `Pulse · ${rec.symbol} · ${topSeverity.toUpperCase()}`,
            "Priority": priority,
            "Tags": "chart_with_upwards_trend,bell",
          },
          body: summary,
        });
        if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
      },
    });
  }

  const telegramToken = process.env.PULSE_TELEGRAM_BOT_TOKEN;
  const telegramChat = process.env.PULSE_TELEGRAM_CHAT_ID;
  if (telegramToken && telegramChat) {
    channels.push({
      name: "telegram",
      send: async (rec, summary) => {
        const text = `*Pulse Terminal Alert · ${rec.symbol}*\n${escapeMarkdown(summary)}`;
        const res = await fetch(
          `https://api.telegram.org/bot${telegramToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: telegramChat,
              text,
              parse_mode: "Markdown",
              disable_web_page_preview: true,
            }),
          },
        );
        if (!res.ok) throw new Error(`telegram HTTP ${res.status}`);
      },
    });
  }

  return channels;
}

function highestSeverity(rec: ScanRecord): Severity {
  let best: Severity = "low";
  for (const f of rec.findings) {
    if (SEV_RANK[f.severity] > SEV_RANK[best]) best = f.severity;
  }
  return best;
}

/** Escape Telegram Markdown V1 special chars in user-provided summary text. */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]`])/g, "\\$1");
}
