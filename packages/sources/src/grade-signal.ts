// Phase 4 — `grade_signal` MCP tool helper.
//
// Pure function (no I/O) that turns an AnomalyFinding into a structured
// rubric + output schema for Claude to grade. We don't call back into the
// host LLM via MCP sampling — the SDK's sampling capability is still uneven
// across hosts. Instead we hand Claude an explicit rubric and ask it to
// produce a JSON object matching `outputSchema`. This is the same pattern
// used by structured-output prompts: clarity over cleverness.
//
// The rubric is category-specific. Each category has a directional bias
// (etf-outflow expects "down", stablecoin-supply-rising expects "up", etc.)
// derived from the same playbook the backtest route uses
// (apps/web/app/api/backtest/route.ts:31-38) so confidence outputs stay
// coherent with hit-rate scoring downstream.

import type { AnomalyCategory, AnomalyFinding } from "./anomalies.js";

export type SuggestedAction = "watch" | "enter_long" | "enter_short" | "exit" | "ignore";

export interface GradeSignalOutput {
  confidence: number;            // 0..1
  reasoning: string;             // 2-4 sentences citing rubric dimensions
  suggested_action: SuggestedAction;
  risk_flags: string[];          // things that could invalidate the call
}

export interface GradeSignalRubric {
  finding: AnomalyFinding;
  marketContext: Record<string, unknown> | null;
  rubric: {
    weights: {
      signalStrength: number;          // how extreme is the trigger?
      regimeAlignment: number;         // does macro context support it?
      crossSourceConfirmation: number; // do other categories agree?
      historicalHitRate: number;       // from backtest if Claude has it; else neutral 0.5
    };
    formula: string;
    considerations: string[];
    expectedDirection: "up" | "down" | "neutral";
  };
  outputSchema: {
    confidence: "number 0..1, where 0 = pure noise, 1 = textbook setup";
    reasoning: "string — 2-4 sentences citing the rubric dimensions";
    suggested_action: "watch | enter_long | enter_short | exit | ignore";
    risk_flags: "string[] — concrete events that would invalidate the call";
  };
  instructions: string;
}

/** Same direction map the backtest scorer uses — keeps hit-rate semantics aligned. */
const EXPECTED_DIRECTION: Record<AnomalyCategory, "up" | "down" | "neutral"> = {
  etf: "down",        // outflow → expect down
  funding: "down",    // overheated → expect mean revert down
  futures: "down",    // crowded long → expect down
  stablecoin: "up",   // dry powder building → expect up over time
  tvl: "down",
  dex: "down",
};

/**
 * Per-category guidance. The model reads these as the "expert tells me what to
 * weigh for THIS pattern" hints — without them every signal would be graded
 * with the same generic checklist.
 */
const CATEGORY_CONSIDERATIONS: Record<AnomalyCategory, string[]> = {
  etf: [
    "Look at $ size of outflow vs prior 30d range — a single -$200M day is normal in 2025; -$500M is extreme.",
    "Persistence matters more than magnitude: 5 consecutive outflow days > one giant red day.",
    "Cross-check funding: outflow + crowded long is the classic capitulation setup.",
  ],
  funding: [
    "Magnitude: 0.05% per 8h is the rough threshold for 'overheated'; 0.10%+ usually mean-reverts within 24-48h.",
    "Cross-venue spread: if Binance is +0.08% but OKX is -0.01%, the signal is venue-specific not market-wide.",
    "Trend direction: rising into the threshold > already at threshold for days (the latter often precedes a flip).",
  ],
  futures: [
    "Combined OI growth + funding heat is the leveraged-long warning. OI growth alone with cool funding is benign.",
    "Long/short ratio: 3+ on Binance global L/S has historically preceded 5%+ flushes.",
    "Mark price vs index basis can hint at squeeze dynamics — look for futures premium > 0.3%.",
  ],
  stablecoin: [
    "Direction matters: rising supply = bullish lag indicator (deploys over weeks); falling = bearish coincident.",
    "Magnitude: 1.5%/7d is fast; 3%+ is reflexive. Compare to the trailing 90-day average rate of change.",
    "Context: a large mint to USDT alone can be exchange-driven, not flow-driven — check USDC + USDe in parallel.",
  ],
  tvl: [
    "TVL changes are heavily price-driven for non-stablecoin protocols — normalise vs BTC/ETH price moves.",
    "Chain-level TVL drops can be migration (e.g. to L2s) rather than capital flight — check destination chains.",
    "Stablecoin TVL on lending markets (Aave, Compound) is the cleanest 'real money' signal.",
  ],
  dex: [
    "DEX volume spikes are usually risk-on; sudden collapse paired with stablecoin contraction = capital-leaving signal.",
    "Look at top venue concentration — if 24h spike is one chain only, it's likely a meme/airdrop event not macro.",
    "Compare 7d vs 24h: 24h-only collapse with steady 7d means it's a single quiet day, not a regime change.",
  ],
};

/**
 * Severity gates the *minimum* confidence reasonable. A "low" severity finding
 * shouldn't be graded above ~0.65 even by an enthusiastic reader; a "high"
 * severity shouldn't drop below ~0.35 without strong contra-evidence.
 *
 * We surface these as a hint in `instructions` rather than enforcing them — the
 * model still has full latitude, but the anchor prevents wild swings.
 */
const SEVERITY_CONFIDENCE_BAND: Record<AnomalyFinding["severity"], { min: number; max: number }> = {
  low: { min: 0.0, max: 0.65 },
  med: { min: 0.2, max: 0.85 },
  high: { min: 0.35, max: 1.0 },
};

/**
 * Default weight set. Tweak per finding type if the category demands it
 * (e.g. funding leans heavier on signal strength than on regime alignment).
 */
function weightsFor(category: AnomalyCategory) {
  switch (category) {
    case "funding":
      return {
        signalStrength: 0.45,
        regimeAlignment: 0.15,
        crossSourceConfirmation: 0.25,
        historicalHitRate: 0.15,
      };
    case "futures":
      return {
        signalStrength: 0.4,
        regimeAlignment: 0.2,
        crossSourceConfirmation: 0.25,
        historicalHitRate: 0.15,
      };
    case "stablecoin":
      return {
        signalStrength: 0.3,
        regimeAlignment: 0.3,
        crossSourceConfirmation: 0.2,
        historicalHitRate: 0.2,
      };
    default:
      return {
        signalStrength: 0.4,
        regimeAlignment: 0.2,
        crossSourceConfirmation: 0.2,
        historicalHitRate: 0.2,
      };
  }
}

/**
 * Build the rubric payload. Pure — safe for client and server. Consumers
 * (apps/mcp) may wrap this with optional historical hit-rate enrichment by
 * reading the alerts JSONL log; that part is server-only and lives next to
 * the tool definition.
 */
export function buildGradeSignalRubric(
  finding: AnomalyFinding,
  marketContext: Record<string, unknown> | null = null,
): GradeSignalRubric {
  const weights = weightsFor(finding.category);
  const band = SEVERITY_CONFIDENCE_BAND[finding.severity];
  const expectedDirection = EXPECTED_DIRECTION[finding.category];

  return {
    finding,
    marketContext,
    rubric: {
      weights,
      formula:
        "confidence = clamp(" +
        `${weights.signalStrength}*signalStrength + ` +
        `${weights.regimeAlignment}*regimeAlignment + ` +
        `${weights.crossSourceConfirmation}*crossSourceConfirmation + ` +
        `${weights.historicalHitRate}*historicalHitRate, 0, 1)`,
      considerations: CATEGORY_CONSIDERATIONS[finding.category],
      expectedDirection,
    },
    outputSchema: {
      confidence: "number 0..1, where 0 = pure noise, 1 = textbook setup",
      reasoning: "string — 2-4 sentences citing the rubric dimensions",
      suggested_action: "watch | enter_long | enter_short | exit | ignore",
      risk_flags: "string[] — concrete events that would invalidate the call",
    },
    instructions: [
      `Grade this ${finding.severity}-severity ${finding.category} finding using the rubric above.`,
      `Anchor: ${finding.severity}-severity findings should typically score within confidence ${band.min}–${band.max}; deviate only with explicit reasoning.`,
      `Expected directional bias for this category is "${expectedDirection}" — your suggested_action should align unless contra-evidence overrides it.`,
      `Reply with ONLY a JSON object matching outputSchema. Do not echo the rubric. Do not wrap in code fences.`,
      `If marketContext is null, reason from the finding evidence alone and flag the lack of context in risk_flags.`,
    ].join(" "),
  };
}
