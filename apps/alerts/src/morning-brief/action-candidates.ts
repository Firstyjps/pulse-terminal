// Action Candidates — LLM-generated trading ideas with rules-based fallback.
//
// Per .coordinator/telegram-morning-brief-v2.md Task 3:
//   - Anthropic SDK, claude-haiku-4-5, max_tokens 200
//   - In-memory cache keyed by (BKK date + regime) — same regime same day = same suggestion
//   - Fallback rules when ANTHROPIC_API_KEY missing or call fails
//   - Always returns a string (never throws)
//
// Output is bullet-prefixed, multi-line. The format layer drops it under the
// "🎯 Action Candidates" section verbatim (callers must escape MarkdownV2).

import type { ETFFlowResponse } from "@pulse/sources";
import { callLLM } from "./llm/index.js";
import type { RegimeSlice } from "./format.js";

export interface FundingCluster {
  btc: number;        // 8h funding rate %, signed
  eth: number;
  sol: number;
  /** rate × 3 (per day) × 365 — convenience for the LLM prompt. */
  btcAnnualized: number;
  ethAnnualized: number;
  solAnnualized: number;
  lean: "positive" | "negative" | "mixed";
}

export interface ActionCandidatesInput {
  regime: RegimeSlice | null;
  etf: ETFFlowResponse;
  funding: FundingCluster | null;
  catalysts: string[];
}

export type LlmComplete = (system: string, user: string) => Promise<string | null>;

export interface ActionCandidatesOpts {
  /** Inject a custom completer (tests; or to swap the model). */
  complete?: LlmComplete;
  /** Override "now" — affects caching key + catalyst-window detection. */
  now?: number;
  /** Override Date.now() in the cache key for tests; equivalent to `now`. */
  cacheBust?: boolean;
}

// Note on language: the user is a Thai-speaking trader who wants the action
// candidates body in Thai prose with crypto/trading terms kept in English
// (BTC, ETH, SOL, ETF, funding, perp, spot, OI, regime, leverage, …). This is
// a deliberate exception to the project's English-only label policy — those
// labels are Telegram section headers, this is dynamic LLM output addressed
// to one user. Do NOT generalize this to the rest of the brief.
const SYSTEM_PROMPT =
  "You are a quant trading analyst writing for a Thai-speaking trader. Given " +
  "the following morning data, suggest 2-3 ACTION CANDIDATES (exploratory " +
  "ideas only — not trade advice). " +
  "Output in Thai natural language, but keep crypto/trading terms in English: " +
  "BTC, ETH, SOL, ETF, funding, perp, spot, OI, regime, leverage, inflow, " +
  "outflow, cumulative, ann (annualized), bullish, bearish. " +
  "Be terse: 1 line per idea, prefix with bullet (•). Cite specific numbers " +
  "from the data verbatim. Avoid hedging language. " +
  "End with a 1-line risk caveat starting with 'Risk: ' (the word 'Risk' stays " +
  "English; the rest of the caveat is Thai).";

// In-memory cache: key = `${bkkDate}:${regimeLabel}` → string output. Daemon
// restart drops the cache, which is fine (cron fires once/day so the next
// call re-populates).
const cache = new Map<string, string>();

export async function generateActionCandidates(
  input: ActionCandidatesInput,
  opts: ActionCandidatesOpts = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const dateKey = bkkDateStr(now);
  const regimeKey = input.regime?.regime ?? "unknown";
  const cacheKey = `${dateKey}:${regimeKey}`;

  if (!opts.cacheBust && cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  // Test seam: caller can inject a custom completer (skips env-driven dispatch).
  // Default path: route through callLLM, which honors LLM_PROVIDER + falls back
  // gracefully (returns null) when no provider configured or any error occurs.
  const llm: LlmComplete =
    opts.complete ?? ((s, u) => callLLM({ system: s, user: u, maxTokens: 200 }));

  try {
    const result = await llm(SYSTEM_PROMPT, serializeData(input));
    if (result && result.trim()) {
      cache.set(cacheKey, result.trim());
      return result.trim();
    }
  } catch {
    // fall through to rules
  }

  const fallback = rulesFallback(input, now);
  cache.set(cacheKey, fallback);
  return fallback;
}

/** Test seam — clears the in-memory cache between runs. */
export function clearActionCandidatesCache(): void {
  cache.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// Prompt serialization
// ─────────────────────────────────────────────────────────────────────────

function serializeData(input: ActionCandidatesInput): string {
  const lines: string[] = [];

  if (input.regime) {
    lines.push(
      `Regime: ${input.regime.regime} (score ${input.regime.score.toFixed(2)}) — ${input.regime.reason}`,
    );
  } else {
    lines.push("Regime: unavailable");
  }

  const etf = input.etf.summary;
  lines.push(
    `BTC ETF: 24h ${fmtUsd(etf.btcLast)}, 7d ${fmtUsd(etf.btc7dSum)}, cumulative ${fmtUsd(etf.btcCumulative)}`,
  );
  lines.push(
    `ETH ETF: 24h ${fmtUsd(etf.ethLast)}, 7d ${fmtUsd(etf.eth7dSum)}, cumulative ${fmtUsd(etf.ethCumulative)}`,
  );

  if (input.funding) {
    const f = input.funding;
    lines.push(
      `Funding 8h: BTC ${pct(f.btc)} (${pct(f.btcAnnualized)} ann), ETH ${pct(f.eth)}, SOL ${pct(f.sol)} — lean: ${f.lean}`,
    );
  } else {
    lines.push("Funding: unavailable");
  }

  lines.push(
    `Today's catalysts: ${input.catalysts.length ? input.catalysts.join("; ") : "none scheduled"}`,
  );

  return lines.join("\n");
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function pct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(3)}%`;
}

// ─────────────────────────────────────────────────────────────────────────
// Rules fallback
// ─────────────────────────────────────────────────────────────────────────

// Rules fallback strings are Thai prose with English technical terms retained
// (BTC, ETH, ETF, funding, perp, spot, regime, leverage, …) — same convention
// the LLM follows. Keep the bullet prefix `•` and the leading `Risk: ` on the
// caveat line so downstream UI/parsers don't have to special-case the locale.
function rulesFallback(input: ActionCandidatesInput, now: number): string {
  const ideas: string[] = [];

  // 1. Funding harvest setup
  if (
    input.funding?.lean === "negative" &&
    input.regime?.regime === "Risk-Off"
  ) {
    ideas.push(
      `• พิจารณา funding harvest: long spot, short perp (cluster lean ${input.funding.lean}).`,
    );
  }

  // 2. Mean-revert watch on ETH
  if (
    input.etf.summary.eth7dSum > 0 &&
    input.regime?.regime === "Risk-Off"
  ) {
    ideas.push(
      `• ETH mean-revert watch: 7d ETF flow +${(input.etf.summary.eth7dSum / 1e6).toFixed(1)}M สวนทาง regime Risk-Off.`,
    );
  }

  // 3. Catalyst de-risk
  const upcoming = upcomingCatalystWithin(input.catalysts, now, 6);
  if (upcoming) {
    ideas.push(`• ลด leverage ก่อน ${upcoming}.`);
  }

  if (!ideas.length) {
    ideas.push("• ไม่มีสัญญาณชัดเจน — รอดู.");
  }

  ideas.push(
    "Risk: rules-based fallback (LLM ไม่พร้อมใช้งาน) ตัวเลขอาจไม่สะท้อนการเคลื่อนไหวระหว่างวัน.",
  );
  return ideas.join("\n");
}

/**
 * Returns the catalyst label if any HH:MM catalyst is within `windowHours`
 * from `now` (BKK clock). Catalyst format expected: "HH:MM BKK — description".
 */
function upcomingCatalystWithin(
  catalysts: string[],
  now: number,
  windowHours: number,
): string | null {
  const bkk = new Date(now + 7 * 60 * 60_000);
  const todayBase = Date.UTC(
    bkk.getUTCFullYear(),
    bkk.getUTCMonth(),
    bkk.getUTCDate(),
  );

  for (const c of catalysts) {
    const m = c.match(/^(\d{2}):(\d{2})/);
    if (!m) continue;
    const eventBkkMs = todayBase + Number(m[1]) * 3_600_000 + Number(m[2]) * 60_000;
    // bkk local "now" in same UTC base
    const bkkNowMs =
      todayBase +
      bkk.getUTCHours() * 3_600_000 +
      bkk.getUTCMinutes() * 60_000;
    const diff = eventBkkMs - bkkNowMs;
    if (diff >= 0 && diff <= windowHours * 3_600_000) {
      return c;
    }
  }
  return null;
}

function bkkDateStr(epochMs: number): string {
  return new Date(epochMs + 7 * 60 * 60_000).toISOString().slice(0, 10);
}
