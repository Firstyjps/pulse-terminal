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
  /** Single chat id. For broadcast use `chatIds` instead (takes precedence). */
  chatId?: string;
  /** Comma-split env list of chat ids. Renders text + images once, sends per chat. */
  chatIds?: string[];
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

/** Per-chat result. Populated when broadcasting to multiple chat ids. */
export interface RecipientResult {
  chatId: string;
  sent: boolean;
  error?: string;
  imageSent: boolean;
  imageError?: string;
  etfImageSent: boolean;
  etfImageError?: string;
}

export interface RunMorningBriefResult {
  /** True iff every recipient's text message was sent. Mirrors recipients[0] for back-compat single-chat callers. */
  sent: boolean;
  skipped?: boolean;
  reason?: "proxy_data" | "no_etf_data" | "send_failed";
  error?: string;
  text?: string;
  /** "weekday" Mon-Fri BKK · "weekend" Sat/Sun BKK (drops ETF blocks). */
  mode?: "weekday" | "weekend";
  /** Primary recipient (recipients[0]) image status. */
  imageSent?: boolean;
  imageError?: string;
  etfImageSent?: boolean;
  etfImageError?: string;
  /** Per-recipient breakdown — only populated when broadcasting (chatIds.length > 1). */
  recipients?: RecipientResult[];
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

  const recipients: string[] =
    opts.chatIds && opts.chatIds.length > 0
      ? opts.chatIds
      : opts.chatId
        ? [opts.chatId]
        : [];
  if (recipients.length === 0) {
    return { sent: false, reason: "send_failed", error: "no chat ids configured", mode };
  }

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

  // Render PNGs once — reused across all recipients in the broadcast.
  let pricePng: Uint8Array | null = null;
  let priceRenderError: string | undefined;
  if (klines && klines.length >= 2) {
    try {
      const svg = buildBtcPriceChartSvg(klines);
      pricePng = opts.svgToPngImpl ? await opts.svgToPngImpl(svg) : await svgToPng(svg);
      if (!pricePng) priceRenderError = "svg-to-png returned null";
    } catch (err) {
      priceRenderError = (err as Error).message.slice(0, 200);
    }
  } else {
    priceRenderError = "no klines";
  }

  let etfPng: Uint8Array | null = null;
  let etfRenderError: string | undefined;
  if (etf && etf.flows.length >= 2) {
    try {
      const etfSvg = buildBtcEtfFlowsBarChartSvg(etf.flows);
      etfPng = opts.svgToPngImpl ? await opts.svgToPngImpl(etfSvg) : await svgToPng(etfSvg);
      if (!etfPng) etfRenderError = "etf svg-to-png returned null";
    } catch (err) {
      etfRenderError = (err as Error).message.slice(0, 200);
    }
  } else {
    etfRenderError = etf == null ? "no etf data" : "etf flows < 2";
  }

  // Fan out: one sendMessage + up to two sendPhoto per recipient.
  // Each recipient is independent — a failure on one does not stop others.
  const perChat: RecipientResult[] = [];
  for (const chatId of recipients) {
    const result: RecipientResult = {
      chatId,
      sent: false,
      imageSent: false,
      imageError: priceRenderError,
      etfImageSent: false,
      etfImageError: etfRenderError,
    };

    const msgRes = await sendTelegram(
      opts.telegramToken,
      chatId,
      text,
      { replyMarkup: keyboard },
      fetchImpl,
    );
    result.sent = msgRes.ok;
    if (!msgRes.ok) {
      result.error = msgRes.error;
      perChat.push(result);
      continue;
    }

    if (pricePng) {
      const photoRes = await sendTelegramPhoto(
        opts.telegramToken,
        chatId,
        pricePng,
        undefined,
        fetchImpl,
      );
      result.imageSent = photoRes.ok;
      result.imageError = photoRes.ok ? undefined : photoRes.error;
    }

    if (etfPng) {
      const etfPhotoRes = await sendTelegramPhoto(
        opts.telegramToken,
        chatId,
        etfPng,
        undefined,
        fetchImpl,
      );
      result.etfImageSent = etfPhotoRes.ok;
      result.etfImageError = etfPhotoRes.ok ? undefined : etfPhotoRes.error;
    }

    perChat.push(result);
  }

  const primary = perChat[0];
  const broadcastMeta = perChat.length > 1 ? { recipients: perChat } : {};

  if (!primary.sent) {
    return {
      sent: false,
      reason: "send_failed",
      error: primary.error,
      text,
      mode,
      ...broadcastMeta,
    };
  }

  return {
    sent: perChat.every((r) => r.sent),
    text,
    mode,
    imageSent: primary.imageSent,
    imageError: primary.imageError,
    etfImageSent: primary.etfImageSent,
    etfImageError: primary.etfImageError,
    ...broadcastMeta,
  };
}
