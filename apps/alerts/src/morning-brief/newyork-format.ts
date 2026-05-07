import { escapeMarkdownV2 } from "./format.js";

export type NewyorkAsset = "BTC" | "ETH" | "SOL";
export type NewyorkLevelTag = "pivot" | "liquidity" | "confluence";

export interface NewyorkLevelValue {
  price: number;
  tag: NewyorkLevelTag;
}

export interface NewyorkLevels {
  current?: number | null;
  s1: NewyorkLevelValue | null;
  s2: NewyorkLevelValue | null;
  r1: NewyorkLevelValue | null;
  r2: NewyorkLevelValue | null;
}

type CompleteNewyorkLevels = NewyorkLevels & {
  s1: NewyorkLevelValue;
  s2: NewyorkLevelValue;
  r1: NewyorkLevelValue;
  r2: NewyorkLevelValue;
};

export interface NewyorkBriefInput {
  asOf: Date;
  nySessionBias?: string | null;
  usMarketSetup?: string | null;
  levels?: Partial<Record<NewyorkAsset, NewyorkLevels | null>> | null;
  etfFlowWatch?: string | null;
  cryptoLeverage?: string | null;
  nyCatalysts?: string[] | null;
  actionCandidates?: string[] | string | null;
}

const ASSETS: NewyorkAsset[] = ["BTC", "ETH", "SOL"];
const TELEGRAM_SOFT_LIMIT = 3900;

function formatBkkTimestamp(d: Date): string {
  const bkk = new Date(d.getTime() + 7 * 60 * 60_000);
  const yyyy = bkk.getUTCFullYear();
  const mm = String(bkk.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bkk.getUTCDate()).padStart(2, "0");
  const hh = String(bkk.getUTCHours()).padStart(2, "0");
  const min = String(bkk.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} BKK`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  const decimals = Math.abs(n) < 1_000 ? 2 : 0;
  return n.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function sentence(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function renderSection(lines: string[], title: string, body: string | string[]): void {
  lines.push(`*${escapeMarkdownV2(title)}*`);
  const items = Array.isArray(body) ? body : [body];
  for (const item of items) {
    const trimmed = item.trim();
    if (trimmed) lines.push(escapeMarkdownV2(trimmed));
  }
  lines.push("");
}

function hasCompleteLevels(levels: NewyorkLevels | null | undefined): levels is CompleteNewyorkLevels {
  return (
    levels != null &&
    isLevel(levels.s1) &&
    isLevel(levels.s2) &&
    isLevel(levels.r1) &&
    isLevel(levels.r2)
  );
}

function isLevel(level: NewyorkLevelValue | null | undefined): level is NewyorkLevelValue {
  return level != null && Number.isFinite(level.price);
}

function renderLevel(label: string, level: NewyorkLevelValue): string {
  return `${label} ${fmtPrice(level.price)} (${level.tag})`;
}

function renderLevels(lines: string[], input: NewyorkBriefInput): void {
  lines.push(`📍 *${escapeMarkdownV2("Support / Resistance")}*`);

  for (const asset of ASSETS) {
    const lv = input.levels?.[asset];
    if (!hasCompleteLevels(lv)) {
      lines.push(`${asset}: ${escapeMarkdownV2("levels unavailable")}`);
      continue;
    }

    const current = lv.current != null ? ` ${fmtPrice(lv.current)}` : "";
    lines.push(escapeMarkdownV2(
      `${asset}${current}: ${renderLevel("S1", lv.s1)} / ${renderLevel("S2", lv.s2)} | ${renderLevel("R1", lv.r1)} / ${renderLevel("R2", lv.r2)}`,
    ));
  }

  lines.push("");
}

function normalizeCandidates(value: NewyorkBriefInput["actionCandidates"]): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split("\n");
  return [];
}

function trimTelegram(text: string): string {
  if (text.length <= TELEGRAM_SOFT_LIMIT) return text;
  const suffix = "\n\n_more omitted_";
  return text.slice(0, TELEGRAM_SOFT_LIMIT - suffix.length).trimEnd() + suffix;
}

export function formatNewyorkBrief(input: NewyorkBriefInput): string {
  const lines: string[] = [];

  lines.push(`🗽 *${escapeMarkdownV2("Pulse Newyork Brief")}*`);
  lines.push(escapeMarkdownV2(formatBkkTimestamp(input.asOf)));
  lines.push("");

  renderSection(lines, "🎯 NY Session Bias", sentence(input.nySessionBias, "Neutral until US cash open confirms."));
  renderSection(lines, "🇺🇸 US Market Setup", sentence(input.usMarketSetup, "Watch DXY, yields, and Nasdaq breadth into NY open."));
  renderLevels(lines, input);
  renderSection(
    lines,
    "💰 ETF / Flow Watch",
    `${sentence(
      input.etfFlowWatch,
      "Use finalized BTC/ETH ETF prints for direction.",
    )} Intraday ETF flow is not final until after US close.`,
  );
  renderSection(
    lines,
    "📊 Crypto Leverage",
    sentence(input.cryptoLeverage, "Funding and OI need confirmation before chasing breakouts."),
  );

  const catalysts = input.nyCatalysts?.filter((x) => x.trim()) ?? [];
  renderSection(lines, "⚠️ NY Catalysts", catalysts.length ? catalysts.map((x) => `- ${x}`) : "No major NY catalysts loaded.");

  const candidates = normalizeCandidates(input.actionCandidates)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((x) => (x.startsWith("-") ? x : `- ${x}`));
  renderSection(
    lines,
    "🎯 Action Candidates",
    candidates.length ? candidates : "No action candidates until levels and leverage align.",
  );

  return trimTelegram(lines.join("\n").trimEnd());
}
