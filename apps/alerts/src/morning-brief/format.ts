// Morning Brief — MarkdownV2 formatter v2 (per .coordinator/telegram-morning-brief-v2.md).
//
// 5 fixed sections + Action Candidates:
//   1. 🎯 Macro Regime
//   2. 💰 BTC ETF Flow
//   3. 🔷 ETH ETF Flow
//   4. 📊 Funding rate cluster (BTC + ETH + SOL)
//   5. ⚠️ Today's catalysts
//   6. 🎯 Action Candidates (LLM-generated, pre-formatted bullets)
//
// Telegram MarkdownV2 reserved chars (escaped EVERYWHERE outside formatting):
//   _ * [ ] ( ) ~ ` > # + - = | { } . !
//
// Pure: no I/O, no Date.now(). Caller passes asOf for determinism.

import type { ETFFlowResponse } from "@pulse/sources";
import type { FundingCluster } from "./action-candidates.js";

export interface RegimeSlice {
  regime: "Risk-On" | "Risk-Off" | "Range";
  score: number;
  reason: string;
  reading?: { dominance?: number; dxy?: number };
}

export interface FormatInput {
  etf: ETFFlowResponse;
  regime: RegimeSlice | null;
  funding: FundingCluster | null;
  catalysts: string[];
  /** Pre-formatted bullet list from action-candidates.ts. Must NOT be MarkdownV2-escaped here — we escape inline. */
  actionCandidates: string;
  asOf: Date;
}

const MV2_RESERVED = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

export function escapeMarkdownV2(s: string): string {
  return s.replace(MV2_RESERVED, "\\$1");
}

const REGIME_EMOJI: Record<RegimeSlice["regime"], string> = {
  "Risk-On": "🟢",
  "Risk-Off": "🔴",
  Range: "🟡",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatBkkHeader(d: Date): string {
  // BKK = UTC+7, no DST.
  const bkk = new Date(d.getTime() + 7 * 60 * 60_000);
  const y = bkk.getUTCFullYear();
  const m = String(bkk.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bkk.getUTCDate()).padStart(2, "0");
  const hh = String(bkk.getUTCHours()).padStart(2, "0");
  const mm = String(bkk.getUTCMinutes()).padStart(2, "0");
  const dayName = DAY_NAMES[bkk.getUTCDay()];
  return `${y}-${m}-${day} (${dayName}) ${hh}:${mm} BKK`;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(n: number, decimals = 3): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

/**
 * Δ vs yesterday for the most recent finalized day. When `pendingOffset=1`
 * (today is stubbed at zero — see ETFFlowResponse._todayPending) we compare
 * flows[len-2] vs flows[len-3] instead of len-1 vs len-2 — otherwise the
 * delta would just be `-yesterday` which is meaningless.
 */
function deltaVsYesterday(
  flows: ETFFlowResponse["flows"],
  pick: "btc" | "eth",
  pendingOffset = 0,
): number | null {
  const lastIdx = flows.length - 1 - pendingOffset;
  if (lastIdx < 1) return null;
  return flows[lastIdx][pick] - flows[lastIdx - 1][pick];
}

const FUNDING_LEAN_EMOJI: Record<FundingCluster["lean"], string> = {
  positive: "🟢",
  negative: "🔴",
  mixed: "🟡",
};

export function formatMorningBrief(input: FormatInput): string {
  const { etf, regime, funding, catalysts, actionCandidates, asOf } = input;
  const lines: string[] = [];

  // ── Header
  lines.push(`📊 *Pulse Morning Brief*`);
  lines.push(escapeMarkdownV2(formatBkkHeader(asOf)));
  lines.push("");

  // ── 1. Macro Regime (🎯)
  lines.push(`🎯 *Macro Regime*`);
  if (regime) {
    const emoji = REGIME_EMOJI[regime.regime];
    const scoreStr = (regime.score >= 0 ? "+" : "") + regime.score.toFixed(2);
    lines.push(`${emoji} *${escapeMarkdownV2(regime.regime)}* \\(score ${escapeMarkdownV2(scoreStr)}\\)`);
    if (regime.reason) lines.push(`_${escapeMarkdownV2(regime.reason)}_`);
    if (regime.reading?.dominance != null && regime.reading?.dxy != null) {
      const dom = regime.reading.dominance.toFixed(1);
      const dxy = regime.reading.dxy.toFixed(1);
      lines.push(`BTC dom ${escapeMarkdownV2(dom)}% · DXY ${escapeMarkdownV2(dxy)}`);
    }
  } else {
    lines.push("_unavailable_");
  }
  lines.push("");

  const pendingOffset = etf._todayPending ? 1 : 0;
  const pendingHint = etf._todayPending ? " \\(today still trading\\)" : "";

  // ── 2. BTC ETF Flow (💰)
  lines.push(`💰 *BTC ETF Flow*`);
  const btcDelta = deltaVsYesterday(etf.flows, "btc", pendingOffset);
  lines.push(
    `24h: *${escapeMarkdownV2(fmtUsd(etf.summary.btcLast))}*${pendingHint}`,
  );
  if (btcDelta !== null) {
    lines.push(`Δ vs yesterday: ${escapeMarkdownV2(fmtUsd(btcDelta))}`);
  }
  lines.push(`7d sum: ${escapeMarkdownV2(fmtUsd(etf.summary.btc7dSum))}`);
  lines.push(`Cumulative: ${escapeMarkdownV2(fmtUsd(etf.summary.btcCumulative))}`);
  lines.push("");

  // ── 3. ETH ETF Flow (🔷) — fixed section in v2 (no skip)
  lines.push(`🔷 *ETH ETF Flow*`);
  const ethDelta = deltaVsYesterday(etf.flows, "eth", pendingOffset);
  lines.push(
    `24h: *${escapeMarkdownV2(fmtUsd(etf.summary.ethLast))}*${pendingHint}`,
  );
  if (ethDelta !== null) {
    lines.push(`Δ vs yesterday: ${escapeMarkdownV2(fmtUsd(ethDelta))}`);
  }
  lines.push(`7d sum: ${escapeMarkdownV2(fmtUsd(etf.summary.eth7dSum))}`);
  lines.push(`Cumulative: ${escapeMarkdownV2(fmtUsd(etf.summary.ethCumulative))}`);
  lines.push("");

  // ── 4. Funding rate cluster (📊)
  lines.push(`📊 *Funding Rate Cluster \\(8h\\)*`);
  if (funding) {
    const leanEmoji = FUNDING_LEAN_EMOJI[funding.lean];
    lines.push(
      `BTC ${escapeMarkdownV2(fmtPct(funding.btc))} · ETH ${escapeMarkdownV2(fmtPct(funding.eth))} · SOL ${escapeMarkdownV2(fmtPct(funding.sol))}`,
    );
    lines.push(
      `${leanEmoji} Lean: *${escapeMarkdownV2(funding.lean)}* \\(BTC ann ${escapeMarkdownV2(fmtPct(funding.btcAnnualized, 1))}\\)`,
    );
  } else {
    lines.push("_unavailable_");
  }
  lines.push("");

  // ── 5. Today's catalysts (⚠️)
  lines.push(`⚠️ *Today's Catalysts*`);
  if (catalysts.length === 0) {
    lines.push("No major catalysts scheduled");
  } else {
    for (const c of catalysts) {
      lines.push(`• ${escapeMarkdownV2(c)}`);
    }
  }
  lines.push("");

  // ── 6. Action Candidates (🎯) — LLM output, escape inline
  lines.push(`🎯 *Action Candidates*`);
  if (actionCandidates.trim()) {
    for (const ln of actionCandidates.split("\n")) {
      lines.push(escapeMarkdownV2(ln));
    }
  } else {
    lines.push("_no candidates generated_");
  }
  lines.push("");

  // ── Footer
  const stampUtc = asOf.toISOString().slice(0, 16).replace("T", " ") + "Z";
  lines.push(
    `⏱ Sources: Farside · Binance · Yahoo · ${escapeMarkdownV2(stampUtc)}`,
  );

  return lines.join("\n");
}
