import { fetchJson } from "../_helpers.js";
import {
  DUAL_ASSET_DIRECTIONS,
  DUAL_ASSET_DURATIONS,
  loadDualAssetsConfig,
  normalizeDuration,
} from "./config.js";
import {
  recordTickRun,
  saveSnapshots,
  updateDailySummary,
} from "./store.js";
import type {
  DualAssetDirection,
  DualAssetDuration,
  DualAssetProduct,
  DualAssetSnapshot,
  DualAssetsConfig,
  DualAssetsFetchBatch,
  DualAssetsTickResult,
} from "./types.js";

const BYBIT_BASE = "https://api.bybit.com";
const DERIBIT_BASE = "https://www.deribit.com/api/v2";

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
  duration: string;
  status: string;
  isVipProduct: boolean;
  settlementTime: string;
}

interface BybitStrikeQuote {
  selectPrice: string;
  apyE8: string;
  maxInvestmentAmount: string;
  expiredAt: string;
}

interface BybitProductExtraInfoItem {
  productId: string;
  currentPrice: string;
  buyLowPrice?: BybitStrikeQuote[];
  sellHighPrice?: BybitStrikeQuote[];
}

async function publicGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const queryString = new URLSearchParams(params).toString();
  const url = `${BYBIT_BASE}${path}${queryString ? `?${queryString}` : ""}`;
  try {
    const json = await fetchJson<BybitResp<T>>(url, { revalidate: 30, retries: 1 });
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

async function getBybitProductList(coin: string): Promise<BybitProductListItem[]> {
  const rows: BybitProductListItem[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const result = await publicGet<{ list?: BybitProductListItem[]; nextPageCursor?: string }>(
      "/v5/earn/advance/product",
      {
        category: "DualAssets",
        coin,
        limit: "100",
        ...(cursor ? { cursor } : {}),
      },
    );
    rows.push(...(result?.list ?? []));
    cursor = result?.nextPageCursor ?? "";
    if (!cursor) break;
  }
  return rows;
}

/**
 * Public Bybit Dual Assets product flattening.
 * Bybit's `apyE8` is APR as a decimal scaled by 1e8, so percent = apyE8 / 1e6.
 */
export async function getDualAssetProducts(
  coin = "SOL",
  quoteCoin = "USDT",
  opts: {
    directions?: DualAssetDirection[];
    durations?: DualAssetDuration[];
  } = {},
): Promise<DualAssetProduct[]> {
  const directions = opts.directions ?? DUAL_ASSET_DIRECTIONS;
  const durations = opts.durations ?? DUAL_ASSET_DURATIONS;
  const list = await getBybitProductList(coin);
  const products = list.filter((product) => {
    const duration = normalizeDuration(product.duration);
    return (
      product.quoteCoin === quoteCoin &&
      product.status === "Available" &&
      duration != null &&
      durations.includes(duration)
    );
  });
  if (!products.length) return [];

  const flat: DualAssetProduct[] = [];
  await Promise.all(products.map(async (product) => {
    const duration = normalizeDuration(product.duration);
    if (!duration) return;
    const extra = await publicGet<{ list?: BybitProductExtraInfoItem[] }>(
      "/v5/earn/advance/product-extra-info",
      { category: "DualAssets", productId: product.productId },
    );
    const item = extra?.list?.[0];
    if (!item) return;

    const indexPrice = Number(item.currentPrice);
    const settlementMs = Number(product.settlementTime);
    const settlementTime = Number.isFinite(settlementMs) && settlementMs > 0
      ? new Date(settlementMs).toISOString()
      : "";

    const push = (quote: BybitStrikeQuote, direction: DualAssetDirection) => {
      if (!directions.includes(direction)) return;
      const targetPrice = Number(quote.selectPrice);
      const apr = Number(quote.apyE8) / 1_000_000;
      if (!Number.isFinite(targetPrice) || !Number.isFinite(apr)) return;
      flat.push({
        productId: product.productId,
        coin: product.baseCoin,
        quoteCoin: product.quoteCoin,
        direction,
        duration,
        targetPrice,
        apr,
        indexPrice,
        isVipOnly: Boolean(product.isVipProduct),
        settlementTime,
      });
    };

    for (const quote of item.buyLowPrice ?? []) push(quote, "BuyLow");
    for (const quote of item.sellHighPrice ?? []) push(quote, "SellHigh");
  }));

  return flat;
}

export async function getSolImpliedVol(): Promise<number | null> {
  try {
    const json = await fetchJson<{ result?: { mark_iv?: number; volume?: number }[] }>(
      `${DERIBIT_BASE}/public/get_book_summary_by_currency?currency=SOL&kind=option`,
      { revalidate: 120, retries: 1 },
    );
    const rows = (json.result ?? []).filter((row) => row.mark_iv && row.mark_iv > 0);
    if (!rows.length) return null;
    const top = rows.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 5);
    const avg = top.reduce((sum, row) => sum + (row.mark_iv ?? 0), 0) / top.length;
    return +avg.toFixed(2);
  } catch {
    return null;
  }
}

function bucketNow(nowUtc = new Date()): { bucket: Date; ictBucket: Date } {
  const bucket = new Date(nowUtc);
  bucket.setUTCSeconds(0, 0);
  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 5) * 5);
  return { bucket, ictBucket: new Date(bucket.getTime() + 7 * 60 * 60 * 1000) };
}

export async function fetchDualAssetSnapshotBatch(
  opts: Partial<DualAssetsConfig> & { now?: Date } = {},
): Promise<DualAssetsFetchBatch> {
  const config = { ...loadDualAssetsConfig(), ...opts };
  const start = Date.now();
  const { bucket, ictBucket } = bucketNow(opts.now);
  const solIvPct = await getSolImpliedVol();
  const snapshots: DualAssetSnapshot[] = [];
  let rawRows = 0;
  let trackSkipped = 0;

  for (const pair of config.pairs ?? ["SOL-USDT"]) {
    const [coin, quoteCoin] = pair.split("-");
    if (!coin || !quoteCoin) continue;
    const products = await getDualAssetProducts(coin, quoteCoin, {
      directions: config.directions ?? DUAL_ASSET_DIRECTIONS,
      durations: config.durations ?? DUAL_ASSET_DURATIONS,
    });

    for (const product of products) {
      if (config.targets !== null && config.targets !== undefined && !config.targets.includes(product.targetPrice)) continue;
      rawRows += 1;
      if (product.apr < (config.minTrackAprPct ?? 55)) {
        trackSkipped += 1;
        continue;
      }

      snapshots.push({
        timestamp_utc: bucket.toISOString(),
        timestamp_ict: ictBucket.toISOString().replace("Z", "+07:00"),
        hour_ict: ictBucket.getUTCHours(),
        product_id: product.productId,
        coin_pair: `${product.coin}-${product.quoteCoin}`,
        direction: product.direction,
        target_price: product.targetPrice,
        apr_pct: +product.apr.toFixed(6),
        duration: product.duration,
        settlement_utc: product.settlementTime || null,
        index_price: Number.isFinite(product.indexPrice) ? product.indexPrice : null,
        is_vip_only: product.isVipOnly ? 1 : 0,
        sol_iv_pct: solIvPct,
      });
    }
  }

  return {
    snapshots,
    rawRows,
    trackSkipped,
    apiLatencyMs: Date.now() - start,
    solIvPct,
  };
}

export async function runDualAssetTick(opts: Partial<DualAssetsConfig> = {}): Promise<DualAssetsTickResult> {
  const config = { ...loadDualAssetsConfig(), ...opts };
  try {
    const batch = await fetchDualAssetSnapshotBatch(config);
    const result = saveSnapshots(batch.snapshots);
    const hot = batch.snapshots.filter((snapshot) => snapshot.apr_pct >= (config.aprAlertPct ?? 100));
    const touchedPairs = [...new Set(batch.snapshots.map((snapshot) => snapshot.coin_pair))];
    const today = new Date().toISOString().slice(0, 10);
    for (const pair of touchedPairs) {
      updateDailySummary(today, pair, {
        durations: config.durations,
        directions: config.directions,
        minAprPct: config.minTrackAprPct,
      });
    }
    const tickResult: DualAssetsTickResult = {
      saved: result.saved,
      skipped: result.skipped + batch.trackSkipped,
      dbSkipped: result.skipped,
      trackSkipped: batch.trackSkipped,
      rawRows: batch.rawRows,
      hot,
      ts: new Date().toISOString(),
      apiLatencyMs: batch.apiLatencyMs,
    };
    recordTickRun({
      timestamp_utc: tickResult.ts,
      saved: tickResult.saved,
      skipped: tickResult.skipped,
      dbSkipped: tickResult.dbSkipped,
      trackSkipped: tickResult.trackSkipped,
      rawRows: tickResult.rawRows,
      hot: tickResult.hot.length,
      apiLatencyMs: tickResult.apiLatencyMs,
      status: "ok",
    });
    return tickResult;
  } catch (err) {
    recordTickRun({
      saved: 0,
      skipped: 0,
      status: "error",
      error: (err as Error).message,
    });
    throw err;
  }
}
