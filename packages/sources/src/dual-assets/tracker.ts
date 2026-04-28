// Bybit Dual Assets — fetcher + tick processor.
// Ported from Bybit Api/tracker.py + notifier.py + config.py.
//
// SECURITY: Bybit Dual Assets endpoints require a SIGNED V5 request (BYBIT_API_KEY/SECRET).
// Use a READ-ONLY key (no trade, no withdrawal). See SECURITY.md.

import { createHmac } from "node:crypto";
import { fetchJson } from "../_helpers.js";
import { saveSnapshot, updateDailySummary } from "./store.js";
import type { DualAssetDirection, DualAssetProduct, DualAssetSnapshot } from "./types.js";

const BYBIT_BASE = "https://api.bybit.com";
const DERIBIT_BASE = "https://www.deribit.com/api/v2";

// Defaults match Bybit Api/config.py — overridable via env
const DEFAULT_PAIRS = (process.env.DUAL_ASSETS_PAIRS ?? "SOL-USDT").split(",");
const DEFAULT_DIRECTIONS = ((process.env.DUAL_ASSETS_DIRECTIONS ?? "BuyLow").split(",")) as DualAssetDirection[];
const DEFAULT_TARGETS = (process.env.DUAL_ASSETS_TARGETS ?? "78,80")
  .split(",").map((s) => parseFloat(s.trim())).filter((n) => Number.isFinite(n));
const TIMEZONE = "Asia/Bangkok"; // ICT, UTC+7

interface BybitSignedResp<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

interface BybitDualAssetItem {
  coin?: string;
  quoteCoin?: string;
  direction?: string;
  duration?: string;
  targetPrice?: string | number;
  apr?: string | number;
  indexPrice?: string | number;
  isVipOnly?: boolean;
  settlementTime?: string;
}

async function signedGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const apiKey = process.env.BYBIT_API_KEY;
  const apiSecret = process.env.BYBIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.warn("[dual-assets] BYBIT_API_KEY/SECRET missing — cannot sign request");
    return null;
  }

  const timestamp = String(Date.now());
  const recvWindow = "5000";
  const queryString = new URLSearchParams(params).toString();
  const signPayload = `${timestamp}${apiKey}${recvWindow}${queryString}`;
  const signature = createHmac("sha256", apiSecret).update(signPayload).digest("hex");

  const url = `${BYBIT_BASE}${path}${queryString ? "?" + queryString : ""}`;

  const res = await fetch(url, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN": signature,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`[dual-assets] Bybit HTTP ${res.status}`);
    return null;
  }
  const json = (await res.json()) as BybitSignedResp<T>;
  if (json.retCode !== 0) {
    console.warn(`[dual-assets] Bybit error ${json.retCode}: ${json.retMsg}`);
    return null;
  }
  return json.result;
}

/**
 * Fetch Dual Assets products. Bybit's exact V5 endpoint name moves around;
 * try the two known paths in order (per Bybit Api/tracker.py:fetch_dual_asset_products).
 */
export async function getDualAssetProducts(coin = "SOL", quoteCoin = "USDT"): Promise<DualAssetProduct[]> {
  const params = { coin, quoteCoin };
  const endpoints = [
    "/v5/earn/dual-asset/product-list",
    "/v5/earn/structured-product/list",
  ];

  for (const ep of endpoints) {
    const result = await signedGet<{ list?: BybitDualAssetItem[] }>(ep, params);
    if (result?.list?.length) {
      return result.list.map((p) => ({
        coin: p.coin ?? coin,
        quoteCoin: p.quoteCoin ?? quoteCoin,
        direction: (p.direction as DualAssetDirection) ?? "BuyLow",
        duration: p.duration ?? "<1D",
        targetPrice: typeof p.targetPrice === "string" ? parseFloat(p.targetPrice) : (p.targetPrice ?? 0),
        apr: typeof p.apr === "string" ? parseFloat(p.apr) : (p.apr ?? 0),
        indexPrice: typeof p.indexPrice === "string" ? parseFloat(p.indexPrice) : (p.indexPrice ?? 0),
        isVipOnly: !!p.isVipOnly,
        settlementTime: p.settlementTime ?? "",
      }));
    }
  }
  return [];
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
  targets?: number[];
  aprAlertThreshold?: number;
} = {}): Promise<TickResult> {
  const pairs = opts.pairs ?? DEFAULT_PAIRS;
  const directions = opts.directions ?? DEFAULT_DIRECTIONS;
  const targets = opts.targets ?? DEFAULT_TARGETS;
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
      if (!targets.includes(p.targetPrice)) continue;
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
