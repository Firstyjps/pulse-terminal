import type { ETFFlowResponse, MacroResponse } from "@pulse/sources";
import { describe, expect, it, vi } from "vitest";
import type { FundingCluster } from "./action-candidates.js";
import type { SymbolSupportResistance } from "./levels.js";
import { formatNewyorkBrief, type NewyorkBriefInput } from "./newyork-format.js";
import { runNewyorkBrief } from "./newyork.js";

const ASOF = new Date("2026-05-07T13:30:00.000Z"); // 20:30 BKK

function makeInput(overrides: Partial<NewyorkBriefInput> = {}): NewyorkBriefInput {
  return {
    asOf: ASOF,
    nySessionBias: "ภาพยังบวกเหนือ BTC pivot; ถ้าขึ้นไม่ผ่านตอน cash open ให้ fade.",
    usMarketSetup: "Nasdaq breadth แข็ง, DXY ทรงตัว, yields ไม่กดดัน.",
    levels: {
      BTC: {
        current: 63_200,
        s1: { price: 62_000, tag: "pivot" },
        s2: { price: 60_800, tag: "liquidity" },
        r1: { price: 64_500, tag: "confluence" },
        r2: { price: 66_000, tag: "pivot" },
      },
      ETH: {
        current: 3_110,
        s1: { price: 3_050, tag: "pivot" },
        s2: { price: 2_980, tag: "confluence" },
        r1: { price: 3_180, tag: "liquidity" },
        r2: { price: 3_260, tag: "pivot" },
      },
      SOL: {
        current: 147.25,
        s1: { price: 142.5, tag: "liquidity" },
        s2: { price: 138, tag: "pivot" },
        r1: { price: 151, tag: "confluence" },
        r2: { price: 158.5, tag: "liquidity" },
      },
    },
    etfFlowWatch: "BTC ETF demand ยังบวก; ETH ยัง lag.",
    cryptoLeverage: "Funding เริ่มอุ่นแต่ยังไม่ euphoric; OI เพิ่มเข้าหาแนวต้าน.",
    nyCatalysts: ["US jobless claims", "Fed speaker หลัง cash open"],
    actionCandidates: ["BTC breakout เฉพาะเหนือ R1", "ETH relative strength catch-up ถ้า BTC ยืน S1"],
    ...overrides,
  };
}

describe("formatNewyorkBrief", () => {
  it("renders the fixed header and section set", () => {
    const out = formatNewyorkBrief(makeInput());

    expect(out).toContain("🗽 *สรุป Newyork Brief*");
    expect(out).toContain("2026\\-05\\-07 20:30 BKK");

    for (const heading of [
      "🎯 มุมมอง NY Session",
      "🇺🇸 ภาพตลาดสหรัฐ",
      "💰 จับตา ETF / Flow",
      "📊 Leverage คริปโต",
      "⚠️ Catalyst ฝั่ง NY",
      "🎯 แผนรับมือ",
    ]) {
      expect(out).toContain(`*${heading}*`);
    }
    expect(out).toContain("📍 *แนวรับ / แนวต้าน*");
  });

  it("renders BTC, ETH, and SOL S/R levels with S1/S2/R1/R2 and required tags", () => {
    const out = formatNewyorkBrief(makeInput());

    expect(out).toContain("BTC 63,200: S1 62,000 \\(pivot\\) / S2 60,800 \\(liquidity\\) \\| R1 64,500 \\(confluence\\) / R2 66,000 \\(pivot\\)");
    expect(out).toContain("ETH 3,110: S1 3,050 \\(pivot\\) / S2 2,980 \\(confluence\\) \\| R1 3,180 \\(liquidity\\) / R2 3,260 \\(pivot\\)");
    expect(out).toContain("SOL 147\\.25: S1 142\\.50 \\(liquidity\\) / S2 138\\.00 \\(pivot\\) \\| R1 151\\.00 \\(confluence\\) / R2 158\\.50 \\(liquidity\\)");
  });

  it("renders levels unavailable for missing S/R assets", () => {
    const out = formatNewyorkBrief(makeInput({ levels: { BTC: null } }));

    expect(out).toContain("BTC: ไม่มีข้อมูลแนวรับ/แนวต้าน");
    expect(out).toContain("ETH: ไม่มีข้อมูลแนวรับ/แนวต้าน");
    expect(out).toContain("SOL: ไม่มีข้อมูลแนวรับ/แนวต้าน");
  });

  it("includes ETF finalization note", () => {
    const out = formatNewyorkBrief(makeInput());

    expect(out).toContain("ตัวเลข ETF ระหว่างวันยังไม่ final จนกว่าตลาดสหรัฐจะปิด\\.");
  });

  it("does not include portfolio, PnL, or exposure language", () => {
    const out = formatNewyorkBrief(makeInput());

    expect(out.toLowerCase()).not.toContain("portfolio");
    expect(out.toLowerCase()).not.toContain("pnl");
    expect(out).not.toContain("PnL");
    expect(out.toLowerCase()).not.toContain("exposure");
  });
});

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

const fakeEtf: ETFFlowResponse = {
  flows: [
    { date: "2026-05-06", btc: 120_000_000, eth: 8_000_000, btcCumulative: 30_120_000_000, ethCumulative: 4_008_000_000 },
    { date: "2026-05-07", btc: 210_000_000, eth: -5_000_000, btcCumulative: 30_330_000_000, ethCumulative: 4_003_000_000 },
  ],
  summary: {
    btcLast: 210_000_000,
    ethLast: -5_000_000,
    btcCumulative: 30_330_000_000,
    ethCumulative: 4_003_000_000,
    btc7dSum: 1_100_000_000,
    eth7dSum: 40_000_000,
    btc30dSum: 4_200_000_000,
    eth30dSum: 180_000_000,
  },
  _source: "farside",
  _isProxy: false,
};

const fakeFunding: FundingCluster = {
  btc: 0.0123,
  eth: 0.008,
  sol: 0.015,
  btcAnnualized: 13.47,
  ethAnnualized: 8.76,
  solAnnualized: 16.42,
  lean: "positive",
};

const fakeMacro: MacroResponse = {
  dxy: { symbol: "DXY", label: "US Dollar Index", current: 105.3, change24h: -0.18, history: [] },
  spx: { symbol: "SPX", label: "S&P 500", current: 5_250, change24h: 0.32, history: [] },
  gold: { symbol: "GLD", label: "Gold", current: 2_380, change24h: -0.1, history: [] },
  generatedAt: "2026-05-07T13:00:00.000Z",
};

const fakeLevels: SymbolSupportResistance[] = [
  {
    symbol: "BTCUSDT",
    status: "ok",
    current: 63_200,
    support: { s1: { price: 62_000, tag: "pivot" }, s2: { price: 60_800, tag: "liquidity" } },
    resistance: { r1: { price: 64_500, tag: "confluence" }, r2: { price: 66_000, tag: "pivot" } },
  },
  {
    symbol: "ETHUSDT",
    status: "ok",
    current: 3_110,
    support: { s1: { price: 3_050, tag: "pivot" }, s2: { price: 2_980, tag: "pivot" } },
    resistance: { r1: { price: 3_180, tag: "liquidity" }, r2: { price: 3_260, tag: "pivot" } },
  },
  {
    symbol: "SOLUSDT",
    status: "ok",
    current: 147.25,
    support: { s1: { price: 142.5, tag: "liquidity" }, s2: { price: 138, tag: "pivot" } },
    resistance: { r1: { price: 151, tag: "confluence" }, r2: { price: 158.5, tag: "liquidity" } },
  },
];

describe("runNewyorkBrief", () => {
  it("renders a dry-run Newyork brief without sending Telegram", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      regime: "Risk-On",
      score: 0.42,
      reason: "BTC holding above weekly VWAP",
      reading: { dominance: 56.5, dxy: 105.3 },
    }));

    const r = await runNewyorkBrief({
      now: ASOF.getTime(),
      hubBase: "http://127.0.0.1:8081",
      telegramToken: "fake:token",
      dryRun: true,
      fetchImpl,
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      fetchMacro: async () => fakeMacro,
      fetchOi: async () => [
        { asset: "BTC", oiUsd: 19_000_000_000 },
        { asset: "ETH", oiUsd: 8_500_000_000 },
        { asset: "SOL", oiUsd: 1_200_000_000 },
      ],
      fetchLevels: async () => fakeLevels,
      loadCatalysts: () => ["20:30 BKK — US jobless claims", "08:00 BKK — old event"],
    });

    expect(r.sent).toBe(false);
    expect(r.reason).toBe("dry_run");
    expect(r.text).toContain("🗽 *สรุป Newyork Brief*");
    expect(r.text).toContain("BTC 63,200");
    expect(r.text).toContain("20:30 BKK");
    expect(r.text).not.toContain("08:00 BKK");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
