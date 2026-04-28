// Sample option chain + APR data for showcasing chart components without
// waiting for the live aggregator port. Shape mirrors the props of
// IVSmile / OIByStrike / GreeksHeatmap / FundingHistory.
//
// Numbers are synthetic but plausible: SOL options expiring 30JUN26, spot $200.
// Use these in design routes, Storybook, or local debugging.

import type { GreeksRow } from "../GreeksHeatmap";
import type { IVPoint } from "../IVSmile";
import type { OIPoint } from "../OIByStrike";
import type { FundingPoint } from "../FundingHistory";

export const SAMPLE_SPOT = 200;
export const SAMPLE_EXPIRY = "2026-06-30";

const STRIKES = [
  120, 130, 140, 150, 155, 160, 165, 170, 175, 180,
  185, 190, 195, 200, 205, 210, 215, 220, 225, 230,
  235, 240, 245, 250, 260,
];

/** Distance from ATM in moneyness space (log-strike), used to shape IV smile + Greeks. */
function moneyness(strike: number): number {
  return Math.log(strike / SAMPLE_SPOT);
}

/** Synthetic IV smile: 65% ATM, ramps up by ~20% per unit of |moneyness|, slight put skew. */
function iv(strike: number, side: "call" | "put"): number {
  const m = moneyness(strike);
  const skew = side === "put" ? 0.04 * Math.abs(m) * 100 : 0;
  return 65 + Math.abs(m) * 100 * 0.6 + skew;
}

/** OI distribution: bell curve peaked at ATM. */
function oi(strike: number, side: "call" | "put"): number {
  const m = moneyness(strike);
  const base = 12_000 * Math.exp(-12 * m * m);
  // Calls slightly higher above spot, puts slightly higher below — typical positioning
  const tilt = side === "call" ? (strike >= SAMPLE_SPOT ? 1.15 : 0.85) : (strike < SAMPLE_SPOT ? 1.2 : 0.7);
  return Math.round(base * tilt);
}

/** Black-Scholes-ish toy Greeks. Not exact — meant as plausible visual data. */
function greeksFor(strike: number, side: "call" | "put"): Pick<GreeksRow, "delta" | "gamma" | "theta" | "vega"> {
  const m = moneyness(strike);
  const callDelta = 0.5 + 0.5 * Math.tanh(-m * 4);
  const delta = side === "call" ? callDelta : callDelta - 1;
  const gamma = 0.012 * Math.exp(-8 * m * m);
  const vega = 0.18 * Math.exp(-6 * m * m);
  // Theta is negative for long positions; here we report long-side theta
  const theta = -0.42 * Math.exp(-6 * m * m);
  return {
    delta: Number(delta.toFixed(4)),
    gamma: Number(gamma.toFixed(4)),
    theta: Number(theta.toFixed(4)),
    vega: Number(vega.toFixed(4)),
  };
}

// ─── IV smile (call + put points) ────────────────────────────────────────
export const SAMPLE_IV_POINTS: IVPoint[] = STRIKES.flatMap((strike) => [
  { strike, iv: Number(iv(strike, "call").toFixed(2)), side: "call" as const },
  { strike, iv: Number(iv(strike, "put").toFixed(2)), side: "put" as const },
]);

/** Single-side variant for demos that want one curve. */
export const SAMPLE_IV_POINTS_FLAT: IVPoint[] = STRIKES.map((strike) => ({
  strike,
  iv: Number(iv(strike, "call").toFixed(2)),
}));

// ─── OI distribution ────────────────────────────────────────────────────
export const SAMPLE_OI_POINTS: OIPoint[] = STRIKES.map((strike) => ({
  strike,
  callOi: oi(strike, "call"),
  putOi: oi(strike, "put"),
}));

// ─── Greeks rows (call + put per strike) ────────────────────────────────
export const SAMPLE_GREEKS_ROWS: GreeksRow[] = STRIKES.flatMap((strike) =>
  (["call", "put"] as const).map((side) => ({
    strike,
    side,
    ...greeksFor(strike, side),
  })),
);

// ─── Funding / APR history (Bybit dual-asset, last 14 days hourly) ──────
function buildFundingHistory(): FundingPoint[] {
  const now = Date.UTC(2026, 3, 28, 12, 0, 0); // 2026-04-28T12:00:00Z
  const points: FundingPoint[] = [];
  for (let h = 14 * 24; h >= 0; h--) {
    const ts = now - h * 3_600_000;
    // baseline 8% APR + diurnal sine + noise + occasional spike
    const hourOfDay = new Date(ts).getUTCHours();
    const diurnal = 3 * Math.sin((hourOfDay / 24) * 2 * Math.PI);
    const drift = 2 * Math.sin(((14 * 24 - h) / (14 * 24)) * 2 * Math.PI);
    const noise = ((h * 9301 + 49297) % 233280) / 233280 - 0.5; // pseudo-random in [-0.5, 0.5]
    const spike = h % 47 === 0 ? 7 : 0;
    const apr = Math.max(0, 8 + diurnal + drift + noise * 1.5 + spike);
    points.push({ ts, apr: Number(apr.toFixed(2)) });
  }
  return points;
}

export const SAMPLE_FUNDING_HISTORY: FundingPoint[] = buildFundingHistory();

/** Convenience bundle for showcase routes. */
export const SAMPLE_OPTION_BUNDLE = {
  spot: SAMPLE_SPOT,
  expiry: SAMPLE_EXPIRY,
  iv: SAMPLE_IV_POINTS,
  ivFlat: SAMPLE_IV_POINTS_FLAT,
  oi: SAMPLE_OI_POINTS,
  greeks: SAMPLE_GREEKS_ROWS,
  funding: SAMPLE_FUNDING_HISTORY,
} as const;
