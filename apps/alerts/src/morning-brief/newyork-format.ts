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
  lines.push(`📍 *${escapeMarkdownV2("แนวรับ / แนวต้าน")}*`);

  for (const asset of ASSETS) {
    const lv = input.levels?.[asset];
    if (!hasCompleteLevels(lv)) {
      lines.push(`${asset}: ${escapeMarkdownV2("ไม่มีข้อมูลแนวรับ/แนวต้าน")}`);
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

  lines.push(`🗽 *${escapeMarkdownV2("สรุป Newyork Brief")}*`);
  lines.push(escapeMarkdownV2(formatBkkTimestamp(input.asOf)));
  lines.push("");

  renderSection(lines, "🎯 มุมมอง NY Session", sentence(input.nySessionBias, "รอ US cash open ยืนยันก่อน"));
  renderSection(lines, "🇺🇸 ภาพตลาดสหรัฐ", sentence(input.usMarketSetup, "จับตา DXY, yields และ Nasdaq breadth ช่วง NY open"));
  renderLevels(lines, input);
  renderSection(
    lines,
    "💰 จับตา ETF / Flow",
    `${sentence(
      input.etfFlowWatch,
      "ใช้ตัวเลข BTC/ETH ETF ที่ finalized แล้วเป็นหลัก.",
    )} ตัวเลข ETF ระหว่างวันยังไม่ final จนกว่าตลาดสหรัฐจะปิด.`,
  );
  renderSection(
    lines,
    "📊 Leverage คริปโต",
    sentence(input.cryptoLeverage, "Funding และ OI ต้องยืนยันก่อน chase breakout."),
  );

  const catalysts = input.nyCatalysts?.filter((x) => x.trim()) ?? [];
  renderSection(lines, "⚠️ Catalyst ฝั่ง NY", catalysts.length ? catalysts.map((x) => `- ${x}`) : "ยังไม่มี catalyst ฝั่ง NY ใน calendar.");

  const candidates = normalizeCandidates(input.actionCandidates)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((x) => (x.startsWith("-") ? x : `- ${x}`));
  renderSection(
    lines,
    "🎯 แผนรับมือ",
    candidates.length ? candidates : "ยังไม่มีแผนจนกว่า levels และ leverage จะเข้าทาง.",
  );

  return trimTelegram(lines.join("\n").trimEnd());
}
