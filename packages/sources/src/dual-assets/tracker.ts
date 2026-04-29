// Bybit Dual Assets — fetcher + tick processor.
//
// Endpoints (V5 public, no auth — Bybit launched Advanced-Earn DualAssets on 2026-03-24,
// retiring the previous /v5/earn/dual-asset/product-list paths):
//   GET /v5/earn/advance/product?category=DualAssets&coin={coin}
//     → list of productId + duration + status + isVipProduct + settlementTime
//   GET /v5/earn/advance/product-extra-info?category=DualAssets&productId={id}
//     → currentPrice + buyLowPrice[]/sellHighPrice[] (each: selectPrice, apyE8, ...)
// BYBIT_API_KEY/SECRET only needed for place-order endpoints (not used in current path).

import { fetchJson } from "../_helpers.js";
import { saveSnapshot, updateDailySummary } from "./store.js";
import type { DualAssetDirection, DualAssetProduct, DualAssetSnapshot } from "./types.js";

const BYBIT_BASE = "https://api.bybit.com";
const DERIBIT_BASE = "https://www.deribit.com/api/v2";

// Defaults — overridable via env
const DEFAULT_PAIRS = (process.env.DUAL_ASSETS_PAIRS ?? "SOL-USDT").split(",");
const DEFAULT_DIRECTIONS = ((process.env.DUAL_ASSETS_DIRECTIONS ?? "BuyLow,SellHigh").split(",")) as DualAssetDirection[];
// DUAL_ASSETS_TARGETS:
//   - "all" (default) → no filter, save every strike Bybit serves (near-spot products
//     have much higher APR than far-OTM ones; the 696%/347% rates on the web are
//     8H near-spot products that filter-by-fixed-target would miss).
//   - "78,80" or any comma list → only save those exact strikes (legacy behavior).
const DEFAULT_TARGETS_RAW = (process.env.DUAL_ASSETS_TARGETS ?? "all").trim();
const DEFAULT_TARGETS: number[] | null = DEFAULT_TARGETS_RAW.toLowerCase() === "all" || DEFAULT_TARGETS_RAW === ""
  ? null
  : DEFAULT_TARGETS_RAW.split(",").map((s) => parseFloat(s.trim())).filter((n) => Number.isFinite(n));
const TIMEZONE = "Asia/Bangkok"; // ICT, UTC+7

interface BybitResp<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

interface BybitProductListItem {
  category: string;
  productId: string;
  baseCoin: string;
  quoteCoin: string;
  duration: string;        // "8h" | "1d" | "9d" …
  status: string;          // "Available" | "NotAvailable" | "SoldOut"
  isVipProduct: boolean;
  settlementTime: string;  // ms timestamp
}

interface BybitStrikeQuote {
  selectPrice: string;          // strike (decimal string)
  apyE8: string;                // APR × 1e8 — e.g. "77585476" = 77.585476%
  maxInvestmentAmount: string;
  expiredAt: string;
}

interface BybitProductExtraInfoItem {
  productId: string;
  currentPrice: string;         // index price (decimal string)
  buyLowPrice: BybitStrikeQuote[];
  sellHighPrice: BybitStrikeQuote[];
}

async function publicGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const queryString = new URLSearchParams(params).toString();
  const url = `${BYBIT_BASE}${path}${queryString ? "?" + queryString : ""}`;
  try {
    const json = await fetchJson<BybitResp<T>>(url, { revalidate: 30 });
    if (json.retCode !== 0) {
      console.warn(`[dual-assets] Bybit error ${json.retCode}: ${json.retMsg}`);
      return null;
    }
    return json.result;
  } catch (err) {
    console.warn(`[dual-assets] Bybit fetch failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Fetch Dual Assets products. Two-step (both endpoints public, no signing):
 *   1. /v5/earn/advance/product → productIds for {coin}, filter Available + matching quoteCoin
 *   2. /v5/earn/advance/product-extra-info per productId → currentPrice + strikes + APR
 * Each (productId × direction × strike) flattens into one DualAssetProduct row.
 */
export async function getDualAssetProducts(coin = "SOL", quoteCoin = "USDT"): Promise<DualAssetProduct[]> {
  const list = await publicGet<{ list?: BybitProductListItem[] }>("/v5/earn/advance/product", {
    category: "DualAssets",
    coin,
  });
  const products = (list?.list ?? []).filter(
    (p) => p.quoteCoin === quoteCoin && p.status === "Available",
  );
  if (!products.length) return [];

  const flat: DualAssetProduct[] = [];
  await Promise.all(products.map(async (p) => {
    const extra = await publicGet<{ list?: BybitProductExtraInfoItem[] }>(
      "/v5/earn/advance/product-extra-info",
      { category: "DualAssets", productId: p.productId },
    );
    const item = extra?.list?.[0];
    if (!item) return;
    const indexPrice = parseFloat(item.currentPrice);
    const settlementMs = Number(p.settlementTime);
    const settlementTime = Number.isFinite(settlementMs) && settlementMs > 0
      ? new Date(settlementMs).toISOString()
      : "";

    const push = (q: BybitStrikeQuote, direction: DualAssetDirection) => {
      flat.push({
        coin: p.baseCoin,
        quoteCoin: p.quoteCoin,
        direction,
        duration: p.duration,
        targetPrice: parseFloat(q.selectPrice),
        apr: Number(q.apyE8) / 1e6,   // apyE8 = APR_decimal × 1e8 → percent = / 1e6
        indexPrice,
        isVipOnly: p.isVipProduct,
        settlementTime,
      });
    };
    item.buyLowPrice.forEach((q) => push(q, "BuyLow"));
    item.sellHighPrice.forEach((q) => push(q, "SellHigh"));
  }));

  return flat;
}

/** Fetch SOL implied volatility from Deribit — average mark_iv of top-5-by-volume options. */
export async function getSolImpliedVol(): Promise<number | null> {
  try {
    const json = await fetchJson<{ result?: { mark_iv?: number; volume?: number }[] }>(
      `${DERIBIT_BASE}/public/get_book_summary_by_currency?currency=SOL&kind=option`,
      { revalidate: 120 },
    );
    const rows = (json.result ?? []).filter((o) => o.mark_iv && o.mark_iv > 0);
    if (!rows.length) return null;
    const top = rows.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 5);
    const avg = top.reduce((s, o) => s + (o.mark_iv ?? 0), 0) / top.length;
    return +avg.toFixed(2);
  } catch {
    return null;
  }
}

interface TickResult {
  saved: number;
  skipped: number;
  hot: DualAssetSnapshot[];
  ts: string;
}

/**
 * Run one tick: fetch products + IV, save snapshots dedup'd to 5-minute buckets,
 * update daily summary, return list of "hot" findings (APR > threshold) for notifier.
 */
export async function runDualAssetTick(opts: {
  pairs?: string[];
  directions?: DualAssetDirection[];
  /** null/undefined = save all targets Bybit serves; array = whitelist only those. */
  targets?: number[] | null;
  aprAlertThreshold?: number;
} = {}): Promise<TickResult> {
  const pairs = opts.pairs ?? DEFAULT_PAIRS;
  const directions = opts.directions ?? DEFAULT_DIRECTIONS;
  const targets: number[] | null = opts.targets !== undefined ? opts.targets : DEFAULT_TARGETS;
  const threshold = opts.aprAlertThreshold ?? Number(process.env.DUAL_ASSETS_APR_ALERT ?? 100);

  const nowUtc = new Date();
  // Round to nearest 5-minute bucket (mimic tracker.py:process_and_save).
  const bucket = new Date(nowUtc);
  bucket.setUTCSeconds(0, 0);
  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 5) * 5);
  // Express same bucket in ICT (UTC+7) for hour_ict.
  const ictBucket = new Date(bucket.getTime() + 7 * 60 * 60 * 1000);

  const ivPct = await getSolImpliedVol();

  let saved = 0;
  let skipped = 0;
  const hot: DualAssetSnapshot[] = [];

  for (const pair of pairs) {
    const [coin, quoteCoin] = pair.split("-");
    const products = await getDualAssetProducts(coin, quoteCoin);
    for (const p of products) {
      if (targets !== null && !targets.includes(p.targetPrice)) continue;
      if (!directions.includes(p.direction)) continue;

      const snap: DualAssetSnapshot = {
        timestamp_utc: bucket.toISOString(),
        timestamp_ict: ictBucket.toISOString().replace("Z", "+07:00"),
        hour_ict: ictBucket.getUTCHours(),
        coin_pair: `${p.coin}-${p.quoteCoin}`,
        direction: p.direction,
        target_price: p.targetPrice,
        apr_pct: p.apr,
        duration: p.duration,
        settlement_utc: p.settlementTime || null,
        index_price: p.indexPrice || null,
        is_vip_only: p.isVipOnly ? 1 : 0,
        sol_iv_pct: ivPct,
      };

      if (saveSnapshot(snap)) saved += 1;
      else skipped += 1;

      if (snap.apr_pct >= threshold) hot.push(snap);
    }
  }

  // Update daily rollup for today (UTC).
  updateDailySummary(bucket.toISOString().slice(0, 10));

  void TIMEZONE; // referenced in comments; kept for clarity
  return { saved, skipped, hot, ts: nowUtc.toISOString() };
}
