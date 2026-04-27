import type { ETFFlow, ETFFlowResponse, ETFSource } from "./types.js";
import { fetchFarsideEtf } from "./farside.js";

type CoinglassETFFlow = {
  date: number | string;
  flow_usd?: number;
  flowUsd?: number;
  netFlow?: number;
};
type CoinglassResp<T> = { code: string; msg?: string; data: T };

async function fetchCoinglass(symbol: "btc" | "eth"): Promise<ETFFlow[] | null> {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) return null;

  const path = symbol === "btc" ? "bitcoin" : "ethereum";
  const url = `https://open-api-v4.coinglass.com/api/etf/${path}/flow-history`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { "CG-API-KEY": apiKey, Accept: "application/json" },
    } as RequestInit);
    if (!res.ok) return null;
    const json = (await res.json()) as CoinglassResp<CoinglassETFFlow[]>;
    if (json.code !== "0" && json.code !== "00000") return null;
    return json.data
      .map((p) => ({
        date: new Date(
          typeof p.date === "string" ? parseInt(p.date, 10) : p.date,
        ).toISOString().slice(0, 10),
        _flow: p.flow_usd ?? p.flowUsd ?? p.netFlow ?? 0,
      }))
      .map(({ date, _flow }) => ({
        date,
        btc: symbol === "btc" ? _flow : 0,
        eth: symbol === "eth" ? _flow : 0,
        btcCumulative: 0,
        ethCumulative: 0,
      }));
  } catch {
    return null;
  }
}

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

  if (process.env.COINGLASS_API_KEY) {
    const [btcFlows, ethFlows] = await Promise.all([
      fetchCoinglass("btc"),
      fetchCoinglass("eth"),
    ]);
    if (btcFlows && ethFlows) {
      const map = new Map<string, ETFFlow>();
      for (const f of btcFlows) map.set(f.date, { ...f });
      for (const f of ethFlows) {
        const existing = map.get(f.date);
        if (existing) existing.eth = f.eth;
        else map.set(f.date, f);
      }
      flows = Array.from(map.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      let btcCum = 0;
      let ethCum = 0;
      for (const f of flows) {
        btcCum += f.btc;
        ethCum += f.eth;
        f.btcCumulative = btcCum;
        f.ethCumulative = ethCum;
      }
      source = "coinglass";
    }
  }

  if (!flows) {
    const farside = await fetchFarsideEtf();
    if (farside && farside.length > 5) {
      flows = farside;
      source = "farside";
    }
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
  };
}
