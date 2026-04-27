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

  try {
    const raw = await fetchJson<BinanceKline[]>(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      { revalidate: 30, retries: 1 },
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
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
