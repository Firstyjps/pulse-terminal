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

  const todayUtc = new Date().toISOString().slice(0, 10);
  const { last, pending } = pickFinalizedLast(flows, todayUtc);
  // 7d / 30d sums are unaffected — leaving today's stub at 0 in the rolling
  // sum is correct (no flow occurred yet). Only the "latest finalized day"
  // pointer needs to skip past the stub.
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
    ...(pending ? { _todayPending: true } : {}),
  };
}

/**
 * Pick the most recent *finalized* day for summary fields. If the tail row is
 * dated today (UTC) AND has zero flows on both BTC + ETH, treat it as Farside's
 * "stub before US close" and shift back one row. Pure helper exported for tests.
 */
export function pickFinalizedLast(
  flows: ETFFlow[],
  todayUtc: string,
): { last: ETFFlow | undefined; pending: boolean } {
  if (flows.length === 0) return { last: undefined, pending: false };
  const tail = flows[flows.length - 1];
  const isStubbedToday =
    tail.date === todayUtc && tail.btc === 0 && tail.eth === 0;
  if (isStubbedToday && flows.length >= 2) {
    return { last: flows[flows.length - 2], pending: true };
  }
  return { last: tail, pending: false };
}
