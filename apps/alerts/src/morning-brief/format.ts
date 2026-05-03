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
  /** True when the hub served a hydrated-from-disk snapshot (cold-start window). */
  _isStale?: boolean;
  /** Age of the snapshot in ms — only present when _isStale. */
  _ageMs?: number;
}

export interface FormatInput {
  /**
   * `weekday` renders the full 5-section brief.
   * `weekend` (BKK Sat/Sun) drops the BTC/ETH ETF blocks and emits a single
   * ⏸ ETF Status line; `etf` is allowed to be null in that mode.
   */
  mode: "weekday" | "weekend";
  etf: ETFFlowResponse | null;
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

/**
 * Weekend ⏸ ETF Status one-liner. Replaces the BTC/ETH flow blocks when
 * `mode === "weekend"`. Two cases:
 *   A: etf has finalized flows → cite last reported date + BTC/ETH last values
 *   B: etf is null / empty → short body only ("flows resume Mon")
 */
function renderEtfStatus(etf: ETFFlowResponse | null, lines: string[]): void {
  lines.push(`⏸ *ETF Status*`);
  const flows = etf?.flows ?? [];
  const pendingOffset = etf?._todayPending ? 1 : 0;
  const lastIdx = flows.length - 1 - pendingOffset;
  const last = lastIdx >= 0 ? flows[lastIdx] : null;
  if (last && etf) {
    const dateEsc = escapeMarkdownV2(last.date);
    const btc = escapeMarkdownV2(fmtUsd(etf.summary.btcLast));
    const eth = escapeMarkdownV2(fmtUsd(etf.summary.ethLast));
    lines.push(
      `US markets closed for the weekend — flows resume Mon\\. Last reported ${dateEsc}: BTC ${btc} · ETH ${eth}\\.`,
    );
  } else {
    lines.push("US markets closed for the weekend — flows resume Mon\\.");
  }
  lines.push("");
}

export function formatMorningBrief(input: FormatInput): string {
  const { mode, etf, regime, funding, catalysts, actionCandidates, asOf } = input;
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
    if (regime._isStale && regime._ageMs != null) {
      const mins = Math.round(regime._ageMs / 60_000);
      lines.push(`_as of ${escapeMarkdownV2(String(mins))}m ago — hub warming up_`);
    }
  } else {
    lines.push("_warming up — check after 09:30 BKK_");
  }
  lines.push("");

  if (mode === "weekday") {
    // etf is required in weekday mode — orchestrator gates this upstream.
    const etfWk = etf as ETFFlowResponse;
    const pendingOffset = etfWk._todayPending ? 1 : 0;
    const pendingHint = etfWk._todayPending ? " \\(today still trading\\)" : "";

    // ── 2. BTC ETF Flow (💰)
    lines.push(`💰 *BTC ETF Flow*`);
    const btcDelta = deltaVsYesterday(etfWk.flows, "btc", pendingOffset);
    lines.push(
      `24h: *${escapeMarkdownV2(fmtUsd(etfWk.summary.btcLast))}*${pendingHint}`,
    );
    if (btcDelta !== null) {
      lines.push(`Δ vs yesterday: ${escapeMarkdownV2(fmtUsd(btcDelta))}`);
    }
    lines.push(`7d sum: ${escapeMarkdownV2(fmtUsd(etfWk.summary.btc7dSum))}`);
    lines.push(`Cumulative: ${escapeMarkdownV2(fmtUsd(etfWk.summary.btcCumulative))}`);
    lines.push("");

    // ── 3. ETH ETF Flow (🔷) — fixed section in v2 (no skip)
    lines.push(`🔷 *ETH ETF Flow*`);
    const ethDelta = deltaVsYesterday(etfWk.flows, "eth", pendingOffset);
    lines.push(
      `24h: *${escapeMarkdownV2(fmtUsd(etfWk.summary.ethLast))}*${pendingHint}`,
    );
    if (ethDelta !== null) {
      lines.push(`Δ vs yesterday: ${escapeMarkdownV2(fmtUsd(ethDelta))}`);
    }
    lines.push(`7d sum: ${escapeMarkdownV2(fmtUsd(etfWk.summary.eth7dSum))}`);
    lines.push(`Cumulative: ${escapeMarkdownV2(fmtUsd(etfWk.summary.ethCumulative))}`);
    lines.push("");
  } else {
    renderEtfStatus(etf, lines);
  }

  // ── 4. Funding rate cluster (📊)
  // 4 decimals on per-venue rates so micro-funding moves (~0.0001%) stay
  // visible — at 3 decimals the underlying signal rounded to "+0.000%" and
  // the user lost sign/sub-bp precision. The annualized line keeps 1 decimal
  // because the multiplier (×3×365) makes it whole-percent already.
  lines.push(`📊 *Funding Rate Cluster \\(8h\\)*`);
  if (funding) {
    const leanEmoji = FUNDING_LEAN_EMOJI[funding.lean];
    lines.push(
      `BTC ${escapeMarkdownV2(fmtPct(funding.btc, 4))} · ETH ${escapeMarkdownV2(fmtPct(funding.eth, 4))}`,
    );
    lines.push(
      `SOL ${escapeMarkdownV2(fmtPct(funding.sol, 4))}`,
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
    // Strip any "Risk: ..." caveat line — user-requested 2026-05-02; brief is
    // exploratory by design, the caveat repeats day-to-day and crowds the message.
    for (const ln of actionCandidates.split("\n")) {
      if (/^\s*risk\s*:/i.test(ln)) continue;
      lines.push(escapeMarkdownV2(ln));
    }
  } else {
    lines.push("_no candidates generated_");
  }
  // No footer — Telegram renders its own send timestamp on every message.

  return lines.join("\n");
}
