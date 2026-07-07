// Deterministic brief composer — same data + formatting as runMorningBrief but
// WITHOUT sending and WITHOUT any LLM (forces rules-based action candidates via
// complete:()=>null). Used by the fallback watchdog to post a brief to the
// Quant topic when the KhunQuant LLM path fails to run. New file: does NOT
// touch runMorningBrief, so hiyuki behaviour is unchanged (zero risk).
import type { ETFFlowResponse } from "@pulse/sources";
import { getETFFlows, getFundingRates } from "@pulse/sources/server";
import { formatMorningBrief, type RegimeSlice } from "./format.js";
import {
  generateActionCandidates,
  type FundingCluster,
} from "./action-candidates.js";
import { loadCatalystsForToday } from "./catalysts.js";
import {
  buildBtcEtfFlowsBarChartSvg,
  buildBtcPriceChartSvg,
  fetchBtcKlines7d,
  svgToPng,
} from "./chart.js";
import { classifyCluster } from "./index.js";

export interface ComposeBriefResult {
  skipped: boolean;
  reason?: "proxy_data" | "no_etf_data";
  mode: "weekday" | "weekend";
  text?: string;
  pricePng?: Uint8Array | null;
  etfPng?: Uint8Array | null;
}

function isBkkWeekend(now: number): boolean {
  const day = new Date(now + 7 * 60 * 60_000).getUTCDay();
  return day === 0 || day === 6;
}

async function fetchRegime(hubBase: string): Promise<RegimeSlice | null> {
  try {
    const res = await fetch(`${hubBase}/regime`, { cache: "no-store" } as RequestInit);
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    return {
      regime: j.regime, score: j.score, reason: j.reason,
      reading: j.reading, _isStale: j._isStale, _ageMs: j._ageMs,
    };
  } catch {
    return null;
  }
}

async function defaultFundingCluster(): Promise<FundingCluster | null> {
  const [btc, eth, sol] = await Promise.all([
    getFundingRates({ exchange: "binance", symbol: "BTCUSDT" }),
    getFundingRates({ exchange: "binance", symbol: "ETHUSDT" }),
    getFundingRates({ exchange: "binance", symbol: "SOLUSDT" }),
  ]);
  const b = btc[0]?.ratePercent, e = eth[0]?.ratePercent, s = sol[0]?.ratePercent;
  if (b == null || e == null || s == null) return null;
  return classifyCluster(b, e, s);
}

export async function composeBriefPayload(opts: {
  now: number;
  hubBase: string;
}): Promise<ComposeBriefResult> {
  const mode: "weekday" | "weekend" = isBkkWeekend(opts.now) ? "weekend" : "weekday";
  const [etfR, regimeR, fundingR, klinesR] = await Promise.allSettled([
    getETFFlows(),
    fetchRegime(opts.hubBase),
    defaultFundingCluster(),
    fetchBtcKlines7d(fetch),
  ]);

  let etf: ETFFlowResponse | null = null;
  if (mode === "weekday") {
    if (etfR.status === "rejected") return { skipped: true, reason: "no_etf_data", mode };
    if (etfR.value._isProxy === true) return { skipped: true, reason: "proxy_data", mode };
    if (!etfR.value.flows.length) return { skipped: true, reason: "no_etf_data", mode };
    etf = etfR.value;
  } else {
    etf = etfR.status === "fulfilled" && !etfR.value._isProxy && etfR.value.flows.length
      ? etfR.value : null;
  }

  const regime = regimeR.status === "fulfilled" ? regimeR.value : null;
  const funding = fundingR.status === "fulfilled" ? fundingR.value : null;
  const klines = klinesR.status === "fulfilled" ? klinesR.value : null;
  const catalysts = loadCatalystsForToday({ now: opts.now });

  // Force rules-based candidates (no LLM) so the fallback is fully deterministic.
  const actionCandidates = await generateActionCandidates(
    { regime, etf, funding, catalysts },
    { now: opts.now, complete: async () => null },
  );

  const text = formatMorningBrief({
    mode, etf, regime, funding, catalysts, actionCandidates, asOf: new Date(opts.now),
  });

  let pricePng: Uint8Array | null = null;
  if (klines && klines.length >= 2) {
    try { pricePng = await svgToPng(buildBtcPriceChartSvg(klines)); } catch {}
  }
  let etfPng: Uint8Array | null = null;
  if (etf && etf.flows.length >= 2) {
    try { etfPng = await svgToPng(buildBtcEtfFlowsBarChartSvg(etf.flows)); } catch {}
  }

  return { skipped: false, mode, text, pricePng, etfPng };
}
