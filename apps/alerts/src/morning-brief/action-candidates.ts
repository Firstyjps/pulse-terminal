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

import Anthropic from "@anthropic-ai/sdk";
import type { ETFFlowResponse } from "@pulse/sources";
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

const SYSTEM_PROMPT =
  "You are a quant trading analyst. Given the following morning data, suggest " +
  "2-3 ACTION CANDIDATES (not trade advice — exploratory ideas only). Be terse, " +
  "1 line each, prefix with bullet (•). Cite specific numbers from the data. " +
  "Avoid hedging language. End with a 1-line risk caveat starting with 'Risk: '.";

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

  const llm = opts.complete ?? defaultLlm();
  if (llm) {
    try {
      const result = await llm(SYSTEM_PROMPT, serializeData(input));
      if (result && result.trim()) {
        cache.set(cacheKey, result.trim());
        return result.trim();
      }
    } catch {
      // fall through to rules
    }
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
// Default LLM completer — uses Anthropic SDK if ANTHROPIC_API_KEY is set
// ─────────────────────────────────────────────────────────────────────────

function defaultLlm(): LlmComplete | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const client = new Anthropic({ apiKey: key });
  return async (system, user) => {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system,
      messages: [{ role: "user", content: user }],
    });
    return msg.content
      .filter((b): b is { type: "text"; text: string } & typeof b => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  };
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

function rulesFallback(input: ActionCandidatesInput, now: number): string {
  const ideas: string[] = [];

  // 1. Funding harvest setup
  if (
    input.funding?.lean === "negative" &&
    input.regime?.regime === "Risk-Off"
  ) {
    ideas.push(
      `• Funding harvest candidate: long spot, short perp (cluster lean ${input.funding.lean}).`,
    );
  }

  // 2. Mean-revert watch on ETH
  if (
    input.etf.summary.eth7dSum > 0 &&
    input.regime?.regime === "Risk-Off"
  ) {
    ideas.push(
      `• Mean-revert watch on ETH: 7d ETF flow +${(input.etf.summary.eth7dSum / 1e6).toFixed(1)}M despite Risk-Off regime.`,
    );
  }

  // 3. Catalyst de-risk
  const upcoming = upcomingCatalystWithin(input.catalysts, now, 6);
  if (upcoming) {
    ideas.push(`• Reduce leverage before ${upcoming}.`);
  }

  if (!ideas.length) {
    ideas.push("• No clear setup — observe.");
  }

  ideas.push("Risk: rules-based fallback (LLM unavailable). Numbers may not reflect intraday moves.");
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
