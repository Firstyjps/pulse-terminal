import type {
  ETFFlowResponse,
  FundingRate,
  MacroResponse,
} from "@pulse/sources";
import {
  getETFFlows,
  getFundingRates,
  getMacro,
  getOpenInterest,
} from "@pulse/sources/server";
import type { FundingCluster } from "./action-candidates.js";
import { loadCatalystsForToday } from "./catalysts.js";
import type { RegimeSlice } from "./format.js";
import { classifyCluster } from "./index.js";
import {
  fetchSupportResistance,
  type SymbolSupportResistance,
  type SupportResistanceLevel,
} from "./levels.js";
import {
  formatNewyorkBrief,
  type NewyorkAsset,
  type NewyorkBriefInput,
  type NewyorkLevelValue,
  type NewyorkLevels,
} from "./newyork-format.js";
import { buildMorningBriefKeyboard, sendTelegram } from "./telegram.js";

const DEFAULT_DASHBOARD = "http://localhost:3000/morning";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;

type Symbol = (typeof SYMBOLS)[number];
type CompleteNewyorkLevels = NewyorkLevels & {
  s1: NewyorkLevelValue;
  s2: NewyorkLevelValue;
  r1: NewyorkLevelValue;
  r2: NewyorkLevelValue;
};

interface OiSlice {
  asset: NewyorkAsset;
  oiUsd: number | null;
}

export interface RunNewyorkBriefOpts {
  now: number;
  hubBase: string;
  telegramToken: string;
  chatId?: string;
  chatIds?: string[];
  dashboardUrl?: string;
  dryRun?: boolean;

  fetchImpl?: typeof fetch;
  fetchEtf?: () => Promise<ETFFlowResponse>;
  fetchFunding?: () => Promise<FundingCluster | null>;
  fetchMacro?: () => Promise<MacroResponse | null>;
  fetchOi?: () => Promise<OiSlice[]>;
  fetchLevels?: () => Promise<SymbolSupportResistance[]>;
  loadCatalysts?: () => string[];
}

export interface NewyorkRecipientResult {
  chatId: string;
  sent: boolean;
  error?: string;
  imageSent: false;
  etfImageSent: false;
}

export interface RunNewyorkBriefResult {
  sent: boolean;
  skipped?: boolean;
  reason?: "send_failed" | "dry_run";
  error?: string;
  text?: string;
  imageSent?: false;
  imageError?: string;
  etfImageSent?: false;
  etfImageError?: string;
  recipients?: NewyorkRecipientResult[];
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
  const btcRate = rateOf(btc);
  const ethRate = rateOf(eth);
  const solRate = rateOf(sol);
  if (btcRate == null || ethRate == null || solRate == null) return null;
  return classifyCluster(btcRate, ethRate, solRate);
}

function rateOf(rates: FundingRate[]): number | null {
  const rate = rates[0]?.ratePercent;
  return Number.isFinite(rate) ? rate : null;
}

async function defaultOi(): Promise<OiSlice[]> {
  const settled = await Promise.allSettled(
    SYMBOLS.map(async (symbol) => {
      const rows = await getOpenInterest({ exchange: "binance", symbol });
      return { asset: symbolToAsset(symbol), oiUsd: rows[0]?.oiUsd ?? null };
    }),
  );
  return settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { asset: symbolToAsset(SYMBOLS[i] as Symbol), oiUsd: null },
  );
}

function symbolToAsset(symbol: Symbol): NewyorkAsset {
  return symbol.replace("USDT", "") as NewyorkAsset;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtUsdAbs(n: number): string {
  return fmtUsd(Math.abs(n)).replace(/^\+/, "");
}

function fmtPct(n: number, decimals = 3): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

function fmtPrice(n: number): string {
  return n.toLocaleString("en-US", {
    maximumFractionDigits: Math.abs(n) < 1_000 ? 2 : 0,
    minimumFractionDigits: Math.abs(n) < 1_000 ? 2 : 0,
  });
}

function buildBias(
  regime: RegimeSlice | null,
  macro: MacroResponse | null,
): string {
  const dxy = macro?.dxy?.change24h;
  const dxyHint =
    dxy == null
      ? null
      : dxy > 0.2
        ? "DXY bid is a headwind for crypto beta."
        : dxy < -0.2
          ? "DXY fade supports risk beta."
          : "DXY is not driving a strong directional impulse yet.";

  if (!regime) {
    return ["Range bias until NY cash open confirms.", dxyHint].filter(Boolean).join(" ");
  }

  const base =
    regime.regime === "Risk-On"
      ? "Risk-On / constructive while BTC holds nearest support."
      : regime.regime === "Risk-Off"
        ? "Risk-Off / defensive unless NY reclaims resistance with volume."
        : "Range / wait for NY open to break support or resistance.";
  return [base, regime.reason, dxyHint].filter(Boolean).join(" ");
}

function buildUsMarketSetup(macro: MacroResponse | null): string {
  const parts = [
    macro?.dxy ? `DXY ${macro.dxy.current.toFixed(2)} (${fmtPct(macro.dxy.change24h, 2)})` : null,
    macro?.spx ? `SPX ${macro.spx.current.toFixed(0)} (${fmtPct(macro.spx.change24h, 2)})` : null,
    macro?.gold ? `Gold ${macro.gold.current.toFixed(0)} (${fmtPct(macro.gold.change24h, 2)})` : null,
  ].filter(Boolean);

  return parts.length
    ? `${parts.join(" · ")}. Watch US cash open breadth and DXY follow-through.`
    : "US proxy macro unavailable; use BTC levels and funding/OI confirmation first.";
}

function finalizedEtfRow(etf: ETFFlowResponse | null): ETFFlowResponse["flows"][number] | null {
  const flows = etf?.flows ?? [];
  const pendingOffset = etf?._todayPending ? 1 : 0;
  const idx = flows.length - 1 - pendingOffset;
  return idx >= 0 ? flows[idx] : null;
}

function buildEtfWatch(etf: ETFFlowResponse | null): string {
  const row = finalizedEtfRow(etf);
  if (!row || !etf) return "Finalized BTC/ETH ETF flow unavailable.";
  const source =
    etf._isProxy
      ? " Source is proxy/fallback, treat with lower confidence."
      : etf._todayPending
        ? " Latest intraday row is pending; using prior finalized print."
        : "";
  return `Last finalized ${row.date}: BTC ${fmtUsd(row.btc)} · ETH ${fmtUsd(row.eth)}. 7d: BTC ${fmtUsd(etf.summary.btc7dSum)} · ETH ${fmtUsd(etf.summary.eth7dSum)}.${source}`;
}

function mapLevels(rows: SymbolSupportResistance[]): NewyorkBriefInput["levels"] {
  const out: Partial<Record<NewyorkAsset, NewyorkLevels | null>> = {};
  for (const row of rows) {
    const asset = symbolToAsset(row.symbol);
    if (row.status !== "ok") {
      out[asset] = null;
      continue;
    }
    out[asset] = {
      current: row.current,
      s1: mapLevel(row.support.s1),
      s2: mapLevel(row.support.s2),
      r1: mapLevel(row.resistance.r1),
      r2: mapLevel(row.resistance.r2),
    };
  }
  return out;
}

function mapLevel(level: SupportResistanceLevel | null): NewyorkLevelValue | null {
  if (!level) return null;
  return { price: level.price, tag: level.tag };
}

function buildLeverage(funding: FundingCluster | null, oi: OiSlice[]): string {
  const fundingLine = funding
    ? `Funding 8h: BTC ${fmtPct(funding.btc, 4)} · ETH ${fmtPct(funding.eth, 4)} · SOL ${fmtPct(funding.sol, 4)} (${funding.lean}).`
    : "Funding 8h unavailable.";

  const oiParts = oi
    .filter((x) => x.oiUsd != null && Number.isFinite(x.oiUsd))
    .map((x) => `${x.asset} ${fmtUsdAbs(x.oiUsd as number)}`);
  const oiLine = oiParts.length ? `Binance OI: ${oiParts.join(" · ")}.` : "OI unavailable.";

  const warning = funding
    ? funding.lean === "positive"
      ? "Warning: do not chase late longs into R1/R2 if OI expands."
      : funding.lean === "negative"
        ? "Warning: short squeeze risk rises if price reclaims R1 with spot bid."
        : "Warning: mixed funding favors level-by-level execution."
    : "Warning: use levels first while leverage data warms up.";

  return `${fundingLine} ${oiLine} ${warning}`;
}

function parseBkkCatalystMinutes(text: string): number | null {
  const m = text.match(/\b(\d{1,2}):(\d{2})\s*BKK\b/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(min) || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function filterNyCatalysts(catalysts: string[]): string[] {
  const cutoff = 19 * 60;
  return catalysts.filter((c) => {
    const mins = parseBkkCatalystMinutes(c);
    return mins == null || mins >= cutoff;
  });
}

function completeAssetLevel(
  levels: NewyorkBriefInput["levels"],
  asset: NewyorkAsset,
): CompleteNewyorkLevels | null {
  const lv = levels?.[asset];
  return lv?.s1 && lv?.s2 && lv?.r1 && lv?.r2 ? (lv as CompleteNewyorkLevels) : null;
}

function buildActionCandidates(
  levels: NewyorkBriefInput["levels"],
  regime: RegimeSlice | null,
  funding: FundingCluster | null,
): string[] {
  const btc = completeAssetLevel(levels, "BTC");
  const eth = completeAssetLevel(levels, "ETH");
  const sol = completeAssetLevel(levels, "SOL");
  const bias = regime?.regime ?? "Range";
  const actions: string[] = [];

  if (btc) {
    actions.push(
      `BTC NY trigger: trade continuation only above R1 ${fmtPrice(btc.r1.price)} (${btc.r1.tag}); invalidate below S1 ${fmtPrice(btc.s1.price)} (${btc.s1.tag}).`,
    );
  } else {
    actions.push("BTC: wait for NY open confirmation; levels unavailable.");
  }

  if (eth && sol && btc) {
    actions.push(
      `ETH/SOL beta: favor catch-up only if BTC holds S1; watch ETH R1 ${fmtPrice(eth.r1.price)} and SOL R1 ${fmtPrice(sol.r1.price)}.`,
    );
  }

  if (funding?.lean === "positive") {
    actions.push("Leverage: if funding stays positive into resistance, reduce breakout chase size.");
  } else if (funding?.lean === "negative") {
    actions.push("Leverage: negative funding near support can fuel squeeze setups after reclaim.");
  } else {
    actions.push(`Playbook: ${bias} tape favors level-by-level execution, not blind direction.`);
  }

  return actions.slice(0, 3);
}

export async function runNewyorkBrief(
  opts: RunNewyorkBriefOpts,
): Promise<RunNewyorkBriefResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const [etfR, regimeR, fundingR, macroR, oiR, levelsR] = await Promise.allSettled([
    opts.fetchEtf ? opts.fetchEtf() : getETFFlows(),
    fetchRegime(opts.hubBase, fetchImpl),
    opts.fetchFunding ? opts.fetchFunding() : defaultFundingCluster(),
    opts.fetchMacro ? opts.fetchMacro() : getMacro(),
    opts.fetchOi ? opts.fetchOi() : defaultOi(),
    opts.fetchLevels ? opts.fetchLevels() : fetchSupportResistance({ fetchImpl }),
  ]);

  const etf = etfR.status === "fulfilled" ? etfR.value : null;
  const regime = regimeR.status === "fulfilled" ? regimeR.value : null;
  const funding = fundingR.status === "fulfilled" ? fundingR.value : null;
  const macro = macroR.status === "fulfilled" ? macroR.value : null;
  const oi = oiR.status === "fulfilled" ? oiR.value : [];
  const levels = mapLevels(levelsR.status === "fulfilled" ? levelsR.value : []);
  const catalysts = filterNyCatalysts(
    opts.loadCatalysts ? opts.loadCatalysts() : loadCatalystsForToday({ now: opts.now }),
  );

  const text = formatNewyorkBrief({
    asOf: new Date(opts.now),
    nySessionBias: buildBias(regime, macro),
    usMarketSetup: buildUsMarketSetup(macro),
    levels,
    etfFlowWatch: buildEtfWatch(etf),
    cryptoLeverage: buildLeverage(funding, oi),
    nyCatalysts: catalysts,
    actionCandidates: buildActionCandidates(levels, regime, funding),
  });

  if (opts.dryRun) {
    return { sent: false, skipped: true, reason: "dry_run", text, imageSent: false, etfImageSent: false };
  }

  const recipients: string[] =
    opts.chatIds && opts.chatIds.length > 0
      ? opts.chatIds
      : opts.chatId
        ? [opts.chatId]
        : [];
  if (recipients.length === 0) {
    return { sent: false, reason: "send_failed", error: "no chat ids configured", text };
  }

  const keyboard = buildMorningBriefKeyboard(opts.dashboardUrl ?? DEFAULT_DASHBOARD);
  const perChat: NewyorkRecipientResult[] = [];
  for (const chatId of recipients) {
    const res = await sendTelegram(
      opts.telegramToken,
      chatId,
      text,
      { replyMarkup: keyboard },
      fetchImpl,
    );
    perChat.push({
      chatId,
      sent: res.ok,
      error: res.ok ? undefined : res.error,
      imageSent: false,
      etfImageSent: false,
    });
  }

  const primary = perChat[0];
  const broadcastMeta = perChat.length > 1 ? { recipients: perChat } : {};
  if (!primary.sent) {
    return {
      sent: false,
      reason: "send_failed",
      error: primary.error,
      text,
      imageSent: false,
      etfImageSent: false,
      ...broadcastMeta,
    };
  }

  return {
    sent: perChat.every((r) => r.sent),
    text,
    imageSent: false,
    etfImageSent: false,
    ...broadcastMeta,
  };
}
