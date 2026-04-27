// Read-only portfolio sync — Binance signed account endpoint.
// Requires BINANCE_API_KEY + BINANCE_API_SECRET. SAFE if keys are read-only (no trade permission).
//
// node:crypto is loaded lazily so the barrel stays browser-safe — only
// `getPortfolio()` (server-only) ever pulls it in.
import { fetchJson } from "./_helpers.js";

export interface PortfolioBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  /** Estimated USD valuation if a price could be resolved. */
  usdValue?: number;
}

export interface PortfolioSnapshot {
  source: "binance";
  totalUsd: number;
  balances: PortfolioBalance[];
  ts: number;
}

interface BinanceAccount {
  balances: Array<{ asset: string; free: string; locked: string }>;
  updateTime: number;
}

interface BinancePrice {
  symbol: string;
  price: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

async function sign(secret: string, query: string): Promise<string> {
  const { createHmac } = await dynImport("node:crypto");
  return createHmac("sha256", secret).update(query).digest("hex");
}

/**
 * Fetch spot wallet balances from Binance and price them against USDT.
 * Returns null if API keys aren't configured (NOT an error — opt-in feature).
 */
export async function getPortfolio(): Promise<PortfolioSnapshot | null> {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) return null;

  const ts = Date.now();
  const query = `timestamp=${ts}&recvWindow=10000`;
  const signature = await sign(apiSecret, query);
  const url = `https://api.binance.com/api/v3/account?${query}&signature=${signature}`;

  const res = await fetch(url, {
    headers: { "X-MBX-APIKEY": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Binance account error ${res.status}: ${body.slice(0, 200)}`);
  }
  const account = (await res.json()) as BinanceAccount;

  const nonZero = account.balances
    .map((b) => ({
      asset: b.asset,
      free: parseFloat(b.free),
      locked: parseFloat(b.locked),
      total: parseFloat(b.free) + parseFloat(b.locked),
    }))
    .filter((b) => b.total > 0);

  // Fetch all USDT prices once and reuse
  const prices = await fetchJson<BinancePrice[]>(
    "https://api.binance.com/api/v3/ticker/price",
    { revalidate: 60 },
  );
  const priceMap = new Map(prices.map((p) => [p.symbol, parseFloat(p.price)]));

  let totalUsd = 0;
  const balances: PortfolioBalance[] = nonZero.map((b) => {
    let usd: number | undefined;
    if (b.asset === "USDT" || b.asset === "USDC" || b.asset === "BUSD" || b.asset === "FDUSD") {
      usd = b.total;
    } else {
      const price =
        priceMap.get(`${b.asset}USDT`) ??
        priceMap.get(`${b.asset}BUSD`) ??
        priceMap.get(`${b.asset}USDC`);
      if (price) usd = b.total * price;
    }
    if (usd) totalUsd += usd;
    return { ...b, usdValue: usd };
  });

  balances.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  return {
    source: "binance",
    totalUsd,
    balances,
    ts: account.updateTime,
  };
}
