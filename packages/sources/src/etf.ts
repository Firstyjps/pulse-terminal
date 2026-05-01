// ETF flows — Farside scrape primary, synthesized proxy as last-resort fallback.
// Coinglass was removed 2026-05-01 (user decision: free sources only).
import type { ETFFallbackReason, ETFFlow, ETFFlowResponse, ETFSource } from "./types.js";
import { fetchFarsideEtf } from "./farside.js";

function generateProxyData(): ETFFlow[] {
  const days = 60;
  const result: ETFFlow[] = [];
  const today = new Date();
  let btcCum = 65_000_000_000;
  let ethCum = 4_500_000_000;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - i);
    const dayOfWeek = date.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const seed =
      Math.sin(date.getTime() / 1e8) * 1.5 + Math.cos(date.getTime() / 5e7);
    const btc = isWeekend ? 0 : Math.round((seed * 250 + (Math.random() - 0.4) * 400) * 1e6);
    const eth = isWeekend ? 0 : Math.round((seed * 50 + (Math.random() - 0.45) * 80) * 1e6);

    btcCum += btc;
    ethCum += eth;

    result.push({
      date: date.toISOString().slice(0, 10),
      btc,
      eth,
      btcCumulative: btcCum,
      ethCumulative: ethCum,
    });
  }

  return result;
}

export async function getETFFlows(): Promise<ETFFlowResponse> {
  let flows: ETFFlow[] | null = null;
  let source: ETFSource = "proxy";
  let fallbackReason: ETFFallbackReason | undefined;

  try {
    const farside = await fetchFarsideEtf();
    if (farside && farside.length > 5) {
      flows = farside;
      source = "farside";
    } else {
      fallbackReason = "farside_empty";
    }
  } catch {
    fallbackReason = "farside_threw";
  }

  if (!flows) {
    flows = generateProxyData();
    source = "proxy";
  }

  const last = flows[flows.length - 1];
  const last7 = flows.slice(-7);
  const last30 = flows.slice(-30);

  return {
    flows,
    summary: {
      btcLast: last?.btc ?? 0,
      ethLast: last?.eth ?? 0,
      btcCumulative: last?.btcCumulative ?? 0,
      ethCumulative: last?.ethCumulative ?? 0,
      btc7dSum: last7.reduce((s, f) => s + f.btc, 0),
      eth7dSum: last7.reduce((s, f) => s + f.eth, 0),
      btc30dSum: last30.reduce((s, f) => s + f.btc, 0),
      eth30dSum: last30.reduce((s, f) => s + f.eth, 0),
    },
    _source: source,
    _isProxy: source === "proxy",
    ...(fallbackReason ? { _fallbackReason: fallbackReason } : {}),
  };
}
