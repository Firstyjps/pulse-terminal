// Morning Brief orchestrator (v2) — fetches data, formats, sends.
// Single entrypoint: runMorningBrief({now, hubBase, telegramToken, chatId, dashboardUrl})
//
// v2 adds: funding cluster, catalysts, LLM action candidates, inline keyboard,
// image chart via sendPhoto. The sendPhoto step is best-effort: if the SVG
// → PNG conversion fails (native binding issue) the text message still goes.
//
// Skip rules (weekday only — Mon-Fri BKK):
//   - ETF response _isProxy=true   → reason="proxy_data"
//   - no ETF flows                  → reason="no_etf_data"
//   - sendMessage failure           → reason="send_failed" (also weekend)
//
// Weekend (BKK Sat/Sun) sends with mode="weekend": ETF blocks are replaced
// by a single ⏸ ETF Status line; ETF data is best-effort (null tolerated).
// US holidays still deferred to v3 — see README.

import type { ETFFlowResponse } from "@pulse/sources";
import { getETFFlows, getFundingRates } from "@pulse/sources/server";
import {
  formatMorningBrief,
  type RegimeSlice,
} from "./format.js";
import {
  generateActionCandidates,
  type FundingCluster,
  type LlmComplete,
} from "./action-candidates.js";
import { loadCatalystsForToday } from "./catalysts.js";
import {
  buildMorningBriefKeyboard,
  sendTelegram,
  sendTelegramPhoto,
} from "./telegram.js";
import {
  buildBtcEtfFlowsBarChartSvg,
  buildBtcPriceChartSvg,
  fetchBtcKlines7d,
  svgToPng,
  type KlineRow,
} from "./chart.js";

const DEFAULT_DASHBOARD = "http://localhost:3000/morning";

export interface RunMorningBriefOpts {
  now: number;
  hubBase: string;
  telegramToken: string;
  chatId: string;
  /** Optional: PULSE_DASHBOARD_URL. Default localhost:3000/morning. */
  dashboardUrl?: string;

  // ── Test seams ──────────────────────────────────────────────────────
  fetchImpl?: typeof fetch;
  fetchEtf?: () => Promise<ETFFlowResponse>;
  fetchFunding?: () => Promise<FundingCluster | null>;
  fetchKlines?: () => Promise<KlineRow[] | null>;
  loadCatalysts?: () => string[];
  llmComplete?: LlmComplete;
  /** Override SVG→PNG conversion. Useful for tests + when resvg unavailable. */
  svgToPngImpl?: (svg: string) => Promise<Uint8Array | null>;
}

export interface RunMorningBriefResult {
  sent: boolean;
  skipped?: boolean;
  reason?: "proxy_data" | "no_etf_data" | "send_failed";
  error?: string;
  text?: string;
  /** "weekday" Mon-Fri BKK · "weekend" Sat/Sun BKK (drops ETF blocks). */
  mode?: "weekday" | "weekend";
  /** True iff the BTC price photo step succeeded. False on best-effort failure. */
  imageSent?: boolean;
  imageError?: string;
  /** True iff the BTC ETF flows photo step succeeded. Independent of imageSent. */
  etfImageSent?: boolean;
  etfImageError?: string;
}

function isBkkWeekend(now: number): boolean {
  const bkk = new Date(now + 7 * 60 * 60_000);
  const day = bkk.getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

async function fetchRegime(
  hubBase: string,
  fetchImpl: typeof fetch,
): Promise<RegimeSlice | null> {
  try {
    const res = await fetchImpl(`${hubBase}/regime`, { cache: "no-store" } as RequestInit);
    if (!res.ok) return null;
    const j = (await res.json()) as RegimeSlice & {
      reading?: unknown;
      _isStale?: boolean;
      _ageMs?: number;
    };
    return {
      regime: j.regime,
      score: j.score,
      reason: j.reason,
      reading: j.reading as RegimeSlice["reading"],
      _isStale: j._isStale,
      _ageMs: j._ageMs,
    };
  } catch {
    return null;
  }
}

async function defaultFundingCluster(): Promise<FundingCluster | null> {
  const [btc, eth, sol] = await Promise.all([
    getFundingRates({ exchange: "binance", symbol: "BTCUSDT" }),
    getFundingRates({ exchange: "binance", symbol: "ETHUSDT" }),
    getFundingRates({ exchange: "binance", symbol: "SOLUSDT" }),
  ]);
  const btcRate = btc[0]?.ratePercent;
  const ethRate = eth[0]?.ratePercent;
  const solRate = sol[0]?.ratePercent;
  if (btcRate == null || ethRate == null || solRate == null) return null;
  return classifyCluster(btcRate, ethRate, solRate);
}

/** Pure cluster classifier — exported for tests. */
export function classifyCluster(btc: number, eth: number, sol: number): FundingCluster {
  const arr = [btc, eth, sol];
  const negCount = arr.filter((r) => r < 0).length;
  const posCount = arr.filter((r) => r > 0).length;
  const lean: FundingCluster["lean"] =
    negCount >= 2 ? "negative" : posCount >= 2 ? "positive" : "mixed";
  return {
    btc,
    eth,
    sol,
    btcAnnualized: btc * 3 * 365,
    ethAnnualized: eth * 3 * 365,
    solAnnualized: sol * 3 * 365,
    lean,
  };
}

export async function runMorningBrief(
  opts: RunMorningBriefOpts,
): Promise<RunMorningBriefResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const mode: "weekday" | "weekend" = isBkkWeekend(opts.now) ? "weekend" : "weekday";

  // Parallel fan-out: ETF (required weekday, best-effort weekend), regime
  // + funding best-effort, klines best-effort (BTC 7d price chart for image).
  const [etfR, regimeR, fundingR, klinesR] = await Promise.allSettled([
    opts.fetchEtf ? opts.fetchEtf() : getETFFlows(),
    fetchRegime(opts.hubBase, fetchImpl),
    opts.fetchFunding ? opts.fetchFunding() : defaultFundingCluster(),
    opts.fetchKlines ? opts.fetchKlines() : fetchBtcKlines7d(fetchImpl),
  ]);

  let etf: ETFFlowResponse | null = null;

  if (mode === "weekday") {
    if (etfR.status === "rejected") {
      return {
        sent: false,
        skipped: true,
        reason: "no_etf_data",
        mode,
        error: (etfR.reason as Error)?.message?.slice(0, 200),
      };
    }
    if (etfR.value._isProxy === true) {
      return { sent: false, skipped: true, reason: "proxy_data", mode };
    }
    if (!etfR.value.flows.length) {
      return { sent: false, skipped: true, reason: "no_etf_data", mode };
    }
    etf = etfR.value;
  } else {
    // weekend: fulfilled + non-proxy + has flows → use it; anything else → null.
    etf =
      etfR.status === "fulfilled" &&
      !etfR.value._isProxy &&
      etfR.value.flows.length
        ? etfR.value
        : null;
  }

  const regime = regimeR.status === "fulfilled" ? regimeR.value : null;
  const funding = fundingR.status === "fulfilled" ? fundingR.value : null;
  const klines = klinesR.status === "fulfilled" ? klinesR.value : null;

  const catalysts = opts.loadCatalysts
    ? opts.loadCatalysts()
    : loadCatalystsForToday({ now: opts.now });

  const actionCandidates = await generateActionCandidates(
    { regime, etf, funding, catalysts },
    { now: opts.now, complete: opts.llmComplete },
  );

  const text = formatMorningBrief({
    mode,
    etf,
    regime,
    funding,
    catalysts,
    actionCandidates,
    asOf: new Date(opts.now),
  });

  const dashboardUrl = opts.dashboardUrl ?? DEFAULT_DASHBOARD;
  const keyboard = buildMorningBriefKeyboard(dashboardUrl);

  const msgRes = await sendTelegram(
    opts.telegramToken,
    opts.chatId,
    text,
    { replyMarkup: keyboard },
    fetchImpl,
  );
  if (!msgRes.ok) {
    return { sent: false, reason: "send_failed", error: msgRes.error, text, mode };
  }

  // Best-effort image #1 — BTC/USD 7d price chart from spot klines. Renders
  // 7 days/week (BTC trades 24/7). Weekend no longer suppresses the image.
  let imageSent = false;
  let imageError: string | undefined;
  if (klines && klines.length >= 2) {
    try {
      const svg = buildBtcPriceChartSvg(klines);
      const png = opts.svgToPngImpl ? await opts.svgToPngImpl(svg) : await svgToPng(svg);
      if (png) {
        const photoRes = await sendTelegramPhoto(
          opts.telegramToken,
          opts.chatId,
          png,
          undefined,
          fetchImpl,
        );
        imageSent = photoRes.ok;
        if (!photoRes.ok) imageError = photoRes.error;
      } else {
        imageError = "svg-to-png returned null";
      }
    } catch (err) {
      imageError = (err as Error).message.slice(0, 200);
    }
  } else {
    imageError = "no klines";
  }

  // Best-effort image #2 — BTC ETF daily flows + cumulative line. Independent
  // of the price chart above; either, both, or neither may succeed and the
  // text body has already been sent.
  let etfImageSent = false;
  let etfImageError: string | undefined;
  if (etf && etf.flows.length >= 2) {
    try {
      const etfSvg = buildBtcEtfFlowsBarChartSvg(etf.flows);
      const etfPng = opts.svgToPngImpl
        ? await opts.svgToPngImpl(etfSvg)
        : await svgToPng(etfSvg);
      if (etfPng) {
        const etfPhotoRes = await sendTelegramPhoto(
          opts.telegramToken,
          opts.chatId,
          etfPng,
          undefined,
          fetchImpl,
        );
        etfImageSent = etfPhotoRes.ok;
        if (!etfPhotoRes.ok) etfImageError = etfPhotoRes.error;
      } else {
        etfImageError = "etf svg-to-png returned null";
      }
    } catch (err) {
      etfImageError = (err as Error).message.slice(0, 200);
    }
  } else {
    etfImageError = etf == null ? "no etf data" : "etf flows < 2";
  }

  return {
    sent: true,
    text,
    mode,
    imageSent,
    imageError,
    etfImageSent,
    etfImageError,
  };
}
