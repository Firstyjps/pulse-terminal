import { fetchJson } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 30;

const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]);

type BinanceKline = [
  openTime: number,
  open: string,
  high: string,
  low: string,
  close: string,
  volume: string,
  closeTime: number,
  quoteVolume: string,
  trades: number,
  takerBuyBase: string,
  takerBuyQuote: string,
  unused: string,
];

export interface KlineRow {
  time: number; // unix seconds (matches Lightweight Charts UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const interval = searchParams.get("interval") ?? "1h";
  const limit = Math.max(50, Math.min(Number(searchParams.get("limit") ?? "240"), 1000));

  if (!/^[A-Z0-9]{4,12}$/.test(symbol)) {
    return Response.json({ error: "invalid symbol" }, { status: 400 });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return Response.json({ error: "invalid interval" }, { status: 400 });
  }

  // Binance hosts (try in order); fall back to Bybit if all return 418/banned.
  const BINANCE_HOSTS = [
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api3.binance.com",
  ];

  let lastErr: Error | null = null;
  for (const host of BINANCE_HOSTS) {
    try {
      const raw = await fetchJson<BinanceKline[]>(
        `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { revalidate: 60, retries: 0 },
      );
      const rows: KlineRow[] = raw.map((k) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
      return Response.json(rows);
    } catch (err) {
      lastErr = err as Error;
      continue;
    }
  }

  // Fallback: Bybit V5 spot klines (different IP rate-limit pool than Binance).
  const BYBIT_INTERVAL: Record<string, string> = {
    "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D", "1w": "W",
  };
  try {
    const bbInterval = BYBIT_INTERVAL[interval] ?? "60";
    const bbRaw = await fetchJson<{
      result: { list: [string, string, string, string, string, string, string][] };
    }>(
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bbInterval}&limit=${limit}`,
      { revalidate: 60, retries: 0 },
    );
    // Bybit returns newest-first — reverse to oldest-first like Binance.
    const rows: KlineRow[] = bbRaw.result.list
      .slice()
      .reverse()
      .map((k) => ({
        time: Math.floor(parseInt(k[0], 10) / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
    return Response.json(rows);
  } catch (bbErr) {
    return Response.json(
      {
        error: `all kline hosts failed. Binance: ${lastErr?.message ?? "unknown"}. Bybit fallback: ${(bbErr as Error).message}`,
      },
      { status: 502 },
    );
  }
}
