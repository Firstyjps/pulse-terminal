// CoinStats Premium API — canonical portfolio aggregator.
//
// Setup: set COINSTATS_API_KEY in env. The user connects wallets/exchanges to
// that API key from the CoinStats dashboard ("Connect Portfolio"); CoinStats
// then aggregates everything into a single portfolio surface accessed here.
//
// Endpoints used (https://openapiv1.coinstats.app):
//   GET /portfolio/coins?currency=USD   → per-asset holdings across all connections
//   GET /portfolio/value?currency=USD   → totals + unrealized P&L (totalValue, allTime, ...)
//
// Auth: header `X-API-KEY: <key>`.
//
// Failure mode: returns `null` when env key is unset. Any HTTP failure throws
// with the key masked to its last 4 chars — caller (portfolio-aggregate) wraps
// in Promise.allSettled so one failure does not break the rest.
//
// Server-only: re-exported through `@pulse/sources/server`.

const BASE = "https://openapiv1.coinstats.app";

export interface CoinStatsAsset {
  symbol: string;
  name?: string;
  amount: number;
  priceUsd: number;
  usdValue: number;
  change24h: number;
  /** Exchange/wallet label when available; CoinStats does not always expose per-coin venue. */
  venue?: string;
}

export interface CoinStatsPortfolio {
  totalUsd: number;
  change24hUsd: number;
  change24hPct: number;
  assets: CoinStatsAsset[];
  asOf: string;
  _source: "coinstats";
  /** True iff the API key is set AND CoinStats has at least one connected wallet/exchange. */
  populated: boolean;
}

interface CoinStatsCoin {
  // Confirmed from /coins (same shape per coin) — /portfolio/coins layers holdings on top
  id?: string;
  symbol?: string;
  name?: string;
  icon?: string;
  rank?: number;
  // Pricing
  price?: number;
  priceUsd?: number;
  priceChange1d?: number;
  priceChange24h?: number;
  // Holdings (portfolio scope)
  count?: number;       // quantity held
  amount?: number;      // some endpoints use 'amount'
  totalValue?: number;  // usd value of holdings
  // P&L 24h on the position
  profit?: { hour24?: number; allTime?: number };
  hour24Profit?: number;
  // Optional venue (when surface includes per-position breakdown)
  exchange?: string;
  walletName?: string;
  portfolioName?: string;
}

interface CoinStatsCoinsResponse {
  result?: CoinStatsCoin[];
}

interface CoinStatsValueResponse {
  totalValue?: number;
  defiValue?: number;
  totalCost?: number;
  unrealizedProfitLoss?: number;
  unrealizedProfitLossPercent?: number;
  // Some accounts return 24h delta — we treat as optional
  hour24ProfitLoss?: number;
  hour24ProfitLossPercent?: number;
}

function maskKey(k: string): string {
  if (!k) return "(unset)";
  if (k.length <= 4) return "****";
  return `…${k.slice(-4)}`;
}

async function csFetch<T>(path: string, key: string): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "X-API-KEY": key, accept: "application/json", "User-Agent": "PulseTerminal/1.0" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`coinstats ${path} → ${res.status} (key ${maskKey(key)}): ${body.slice(0, 180)}`);
  }
  return (await res.json()) as T;
}

function readAmount(c: CoinStatsCoin): number {
  if (typeof c.count === "number") return c.count;
  if (typeof c.amount === "number") return c.amount;
  return 0;
}

function readPrice(c: CoinStatsCoin): number {
  if (typeof c.priceUsd === "number") return c.priceUsd;
  if (typeof c.price === "number") return c.price;
  return 0;
}

function readUsdValue(c: CoinStatsCoin): number {
  if (typeof c.totalValue === "number") return c.totalValue;
  return readAmount(c) * readPrice(c);
}

function readChange24h(c: CoinStatsCoin): number {
  if (typeof c.priceChange1d === "number") return c.priceChange1d;
  if (typeof c.priceChange24h === "number") return c.priceChange24h;
  return 0;
}

function readVenue(c: CoinStatsCoin): string | undefined {
  return c.exchange ?? c.walletName ?? c.portfolioName;
}

/**
 * Fetch the user's CoinStats portfolio, aggregated across every wallet/exchange
 * connected to the Premium API key. Returns `null` when the env key is unset
 * (so callers know to fall back to multi-CEX adapters).
 *
 * When the key is set but CoinStats has no connections yet, returns a populated:false
 * snapshot with totals=0 — caller should treat that as "configured but empty"
 * rather than missing.
 */
export async function getCoinStatsPortfolio(): Promise<CoinStatsPortfolio | null> {
  const key = process.env.COINSTATS_API_KEY;
  if (!key) return null;

  const [coinsRes, valueRes] = await Promise.all([
    csFetch<CoinStatsCoinsResponse>("/portfolio/coins?currency=USD", key),
    csFetch<CoinStatsValueResponse>("/portfolio/value?currency=USD", key),
  ]);

  const raw = coinsRes.result ?? [];
  const assets: CoinStatsAsset[] = raw
    .map((c) => {
      const amount = readAmount(c);
      const priceUsd = readPrice(c);
      const usdValue = readUsdValue(c);
      return {
        symbol: (c.symbol ?? c.id ?? "").toUpperCase(),
        name: c.name,
        amount,
        priceUsd,
        usdValue,
        change24h: readChange24h(c),
        venue: readVenue(c),
      };
    })
    .filter((a) => a.symbol && a.amount > 0)
    .sort((a, b) => b.usdValue - a.usdValue);

  const totalUsd = typeof valueRes.totalValue === "number" && valueRes.totalValue > 0
    ? valueRes.totalValue
    : assets.reduce((s, a) => s + a.usdValue, 0);

  // 24h delta — prefer explicit field, else derive from per-asset (% × usdValue)
  let change24hUsd = typeof valueRes.hour24ProfitLoss === "number" ? valueRes.hour24ProfitLoss : 0;
  if (!change24hUsd) {
    change24hUsd = assets.reduce((s, a) => {
      const yesterdayUsd = a.usdValue / (1 + a.change24h / 100);
      return s + (a.usdValue - yesterdayUsd);
    }, 0);
  }
  const change24hPct = typeof valueRes.hour24ProfitLossPercent === "number"
    ? valueRes.hour24ProfitLossPercent
    : (totalUsd > 0 ? (change24hUsd / Math.max(1, totalUsd - change24hUsd)) * 100 : 0);

  return {
    totalUsd,
    change24hUsd,
    change24hPct,
    assets,
    asOf: new Date().toISOString(),
    _source: "coinstats",
    populated: assets.length > 0,
  };
}

export const _internal = { maskKey, readAmount, readPrice, readUsdValue, readChange24h, readVenue };
