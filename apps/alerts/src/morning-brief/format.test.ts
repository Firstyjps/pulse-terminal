import { describe, expect, it } from "vitest";
import type { ETFFlowResponse } from "@pulse/sources";
import {
  escapeMarkdownV2,
  formatMorningBrief,
  type FormatInput,
  type RegimeSlice,
} from "./format.js";
import type { FundingCluster } from "./action-candidates.js";

const ASOF = new Date("2026-05-04T02:00:00.000Z"); // 09:00 BKK Mon

const ETF_FIXTURE: ETFFlowResponse = {
  flows: [
    { date: "2026-05-02", btc: 100_000_000, eth: 5_000_000, btcCumulative: 30_000_000_000, ethCumulative: 4_000_000_000 },
    { date: "2026-05-03", btc: 245_300_000, eth: 12_400_000, btcCumulative: 30_245_300_000, ethCumulative: 4_012_400_000 },
  ],
  summary: {
    btcLast: 245_300_000,
    ethLast: 12_400_000,
    btcCumulative: 30_245_300_000,
    ethCumulative: 4_012_400_000,
    btc7dSum: 1_200_000_000,
    eth7dSum: 65_000_000,
    btc30dSum: 5_500_000_000,
    eth30dSum: 200_000_000,
  },
  _source: "farside",
  _isProxy: false,
};

const REGIME_FIXTURE: RegimeSlice = {
  regime: "Risk-Off",
  score: -0.667,
  reason: "BTC dom 57.0% rising; funding negative on 3/3 majors",
  reading: { dominance: 57, dxy: 107.2 },
};

const FUNDING_FIXTURE: FundingCluster = {
  btc: -0.012,
  eth: -0.008,
  sol: -0.005,
  btcAnnualized: -13.14,
  ethAnnualized: -8.76,
  solAnnualized: -5.475,
  lean: "negative",
};

const ACTION_CANDIDATES_FIXTURE = [
  "• Funding harvest candidate: long spot, short perp (cluster lean negative).",
  "• Mean-revert watch on ETH: 7d ETF flow +65.0M despite Risk-Off regime.",
  "Risk: rules-based fallback (LLM unavailable). Numbers may not reflect intraday moves.",
].join("\n");

function makeInput(overrides: Partial<FormatInput> = {}): FormatInput {
  return {
    etf: ETF_FIXTURE,
    regime: REGIME_FIXTURE,
    funding: FUNDING_FIXTURE,
    catalysts: ["19:30 BKK — US ISM Manufacturing PMI", "21:00 BKK — Powell speech at Jackson Hole"],
    actionCandidates: ACTION_CANDIDATES_FIXTURE,
    asOf: ASOF,
    ...overrides,
  };
}

describe("escapeMarkdownV2", () => {
  it("escapes every reserved char", () => {
    const reserved = "_*[]()~`>#+-=|{}.!\\";
    const out = escapeMarkdownV2(reserved);
    expect(out.length).toBe(reserved.length * 2);
    for (const ch of reserved) expect(out).toContain("\\" + ch);
  });

  it("leaves alphanumerics + spaces untouched", () => {
    expect(escapeMarkdownV2("Hello world 123")).toBe("Hello world 123");
  });
});

describe("formatMorningBrief — 5 sections + action candidates", () => {
  it("renders all 6 section headers in order", () => {
    const out = formatMorningBrief(makeInput());

    const expectedHeaders = [
      "📊 *Pulse Morning Brief*",
      "🎯 *Macro Regime*",
      "💰 *BTC ETF Flow*",
      "🔷 *ETH ETF Flow*",
      "📊 *Funding Rate Cluster",
      "⚠️ *Today's Catalysts*",
      "🎯 *Action Candidates*",
    ];

    let lastIdx = -1;
    for (const h of expectedHeaders) {
      const idx = out.indexOf(h);
      expect(idx, `missing or out-of-order header: ${h}`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("header has BKK date + day + time", () => {
    const out = formatMorningBrief(makeInput());
    expect(out).toContain("2026\\-05\\-04");
    expect(out).toContain("Mon");
    expect(out).toContain("09:00 BKK");
  });

  it("BTC ETF section shows 24h, delta, 7d, cumulative", () => {
    const out = formatMorningBrief(makeInput());
    expect(out).toContain("24h: *\\+$245\\.3M*");
    expect(out).toContain("Δ vs yesterday: \\+$145\\.3M");
    expect(out).toContain("7d sum: \\+$1\\.20B");
    expect(out).toContain("Cumulative: \\+$30\\.25B");
  });

  it("ETH ETF section is fixed (renders even when small)", () => {
    const tiny = formatMorningBrief(
      makeInput({
        etf: {
          ...ETF_FIXTURE,
          summary: { ...ETF_FIXTURE.summary, ethLast: 50_000, eth7dSum: 100_000 },
        },
      }),
    );
    expect(tiny).toContain("🔷 *ETH ETF Flow*");
    expect(tiny).toContain("24h: *\\+$50\\.0K*");
  });

  it("funding cluster shows 3 rates + lean emoji + annualized", () => {
    const out = formatMorningBrief(makeInput());
    expect(out).toContain("BTC \\-0\\.012% · ETH \\-0\\.008% · SOL \\-0\\.005%");
    expect(out).toContain("🔴 Lean: *negative*");
    expect(out).toContain("BTC ann \\-13\\.1%");
  });

  it("funding section renders 'unavailable' when null", () => {
    const out = formatMorningBrief(makeInput({ funding: null }));
    // section header still present
    expect(out).toContain("📊 *Funding Rate Cluster");
    expect(out).toContain("_unavailable_");
  });

  it("catalysts render as bulleted list", () => {
    const out = formatMorningBrief(makeInput());
    expect(out).toContain("• 19:30 BKK — US ISM Manufacturing PMI");
    expect(out).toContain("• 21:00 BKK — Powell speech at Jackson Hole");
  });

  it("catalysts empty array shows 'No major catalysts scheduled'", () => {
    const out = formatMorningBrief(makeInput({ catalysts: [] }));
    expect(out).toContain("⚠️ *Today's Catalysts*");
    expect(out).toContain("No major catalysts scheduled");
  });

  it("action candidates render line-by-line, MarkdownV2-escaped", () => {
    const out = formatMorningBrief(makeInput());
    // Bullets and content escaped
    expect(out).toContain("🎯 *Action Candidates*");
    expect(out).toContain("• Funding harvest candidate");
    // Risk line preserved
    expect(out).toContain("Risk: rules\\-based fallback");
  });

  it("regime score sign rendered explicitly with '+' or '-'", () => {
    const positive = formatMorningBrief(
      makeInput({
        regime: { regime: "Risk-On", score: 1, reason: "BTC dom falling", reading: { dominance: 49, dxy: 102 } },
      }),
    );
    expect(positive).toContain("🟢");
    expect(positive).toContain("Risk\\-On");
    expect(positive).toContain("score \\+1\\.00");

    const range = formatMorningBrief(
      makeInput({
        regime: { regime: "Range", score: 0, reason: "no decisive macro signal" },
      }),
    );
    expect(range).toContain("🟡");
    expect(range).toContain("score \\+0\\.00");
  });

  it("regime block falls back to 'unavailable' when null", () => {
    const out = formatMorningBrief(makeInput({ regime: null }));
    expect(out).toContain("🎯 *Macro Regime*");
    expect(out).toContain("_unavailable_");
  });

  it("footer lists all 3 sources + UTC timestamp", () => {
    const out = formatMorningBrief(makeInput());
    expect(out).toContain("⏱ Sources: Farside · Binance · Yahoo");
    expect(out).toContain("2026\\-05\\-04 02:00Z");
  });

  it("output stays under Telegram's 4096-char limit for typical payload", () => {
    const out = formatMorningBrief(makeInput());
    expect(out.length).toBeLessThan(4096);
  });

  it("no portfolio / whale / OI / news sections present (v2 explicit drops)", () => {
    const out = formatMorningBrief(makeInput());
    expect(out.toLowerCase()).not.toContain("portfolio");
    expect(out.toLowerCase()).not.toContain("whale");
    expect(out.toLowerCase()).not.toContain("open interest");
    expect(out.toLowerCase()).not.toContain("news");
  });
});
