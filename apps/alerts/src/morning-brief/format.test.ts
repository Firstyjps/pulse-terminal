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
    mode: "weekday",
    etf: ETF_FIXTURE,
    regime: REGIME_FIXTURE,
    funding: FUNDING_FIXTURE,
    catalysts: ["19:30 BKK — US ISM Manufacturing PMI", "21:00 BKK — Powell speech at Jackson Hole"],
    actionCandidates: ACTION_CANDIDATES_FIXTURE,
    asOf: ASOF,
    ...overrides,
  };
}

const SAT_ASOF = new Date("2026-05-09T02:00:00.000Z"); // 09:00 BKK Sat

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

  it("does NOT render a Sources footer line (dropped per user decision)", () => {
    const out = formatMorningBrief(makeInput());
    expect(out).not.toContain("⏱");
    expect(out).not.toContain("Sources:");
    expect(out).not.toContain("Farside · Binance · Yahoo");
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

  it("appends '(today still trading)' to 24h lines when _todayPending=true", () => {
    const out = formatMorningBrief(
      makeInput({
        etf: {
          ...ETF_FIXTURE,
          _todayPending: true,
        },
      }),
    );
    // Both BTC and ETH 24h lines carry the hint
    const btc24h = out.split("\n").find((l) => l.includes("💰") === false && l.startsWith("24h:"));
    expect(out).toContain("today still trading");
    // Hint count: appears twice (once for BTC, once for ETH)
    const occurrences = out.match(/today still trading/g)?.length ?? 0;
    expect(occurrences).toBe(2);
    // Sanity — original 24h value preserved
    expect(out).toContain("\\+$245\\.3M");
    void btc24h;
  });

  it("shifts Δ vs yesterday calculation by one row when _todayPending=true", () => {
    // 3 rows: [day-2] day-1, today(stub).
    // With pendingOffset=1, delta = day-1 - day-2 (not today - day-1).
    const out = formatMorningBrief(
      makeInput({
        etf: {
          ...ETF_FIXTURE,
          flows: [
            { date: "2026-05-01", btc: 100_000_000, eth: 5_000_000, btcCumulative: 30_000_000_000, ethCumulative: 4_000_000_000 },
            { date: "2026-05-02", btc: 245_300_000, eth: 12_400_000, btcCumulative: 30_245_300_000, ethCumulative: 4_012_400_000 },
            { date: "2026-05-03", btc: 0, eth: 0, btcCumulative: 30_245_300_000, ethCumulative: 4_012_400_000 },
          ],
          summary: {
            ...ETF_FIXTURE.summary,
            btcLast: 245_300_000,
            ethLast: 12_400_000,
          },
          _todayPending: true,
        },
      }),
    );
    // Δ = 245.3M - 100M = +145.3M (NOT 0 - 245.3M = -245.3M)
    expect(out).toContain("Δ vs yesterday: \\+$145\\.3M");
    expect(out).not.toContain("Δ vs yesterday: \\-$245\\.3M");
  });
});

describe("formatMorningBrief — weekend mode", () => {
  it("renders ⏸ ETF Status block instead of BTC/ETH flow blocks", () => {
    const out = formatMorningBrief(makeInput({ mode: "weekend", asOf: SAT_ASOF }));
    expect(out).toContain("⏸ *ETF Status*");
    expect(out).not.toContain("💰 *BTC ETF Flow*");
    expect(out).not.toContain("🔷 *ETH ETF Flow*");
  });

  it("ETF Status references last finalized date + BTC/ETH last values", () => {
    const out = formatMorningBrief(makeInput({ mode: "weekend", asOf: SAT_ASOF }));
    expect(out).toContain("Last reported 2026\\-05\\-03"); // last row in ETF_FIXTURE
    expect(out).toContain("BTC \\+$245\\.3M");
    expect(out).toContain("ETH \\+$12\\.4M");
  });

  it("ETF Status falls back to short body when etf is null", () => {
    const out = formatMorningBrief(makeInput({ mode: "weekend", asOf: SAT_ASOF, etf: null }));
    expect(out).toContain("⏸ *ETF Status*");
    expect(out).toContain("US markets closed for the weekend");
    expect(out).not.toContain("Last reported");
  });

  it("ETF Status uses pendingOffset when _todayPending=true (Fri stub row at end)", () => {
    // 3 rows: [day-2] day-1 today(stub). With pendingOffset=1 the "last
    // reported" row should be day-1 (2026-05-08), not the stub at day-0.
    const out = formatMorningBrief(
      makeInput({
        mode: "weekend",
        asOf: SAT_ASOF,
        etf: {
          flows: [
            { date: "2026-05-07", btc: 100_000_000, eth: 5_000_000, btcCumulative: 30_000_000_000, ethCumulative: 4_000_000_000 },
            { date: "2026-05-08", btc: 245_300_000, eth: 12_400_000, btcCumulative: 30_245_300_000, ethCumulative: 4_012_400_000 },
            { date: "2026-05-09", btc: 0, eth: 0, btcCumulative: 30_245_300_000, ethCumulative: 4_012_400_000 },
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
          _todayPending: true,
        },
      }),
    );
    expect(out).toContain("Last reported 2026\\-05\\-08");
    expect(out).not.toContain("Last reported 2026\\-05\\-09");
  });

  it("keeps regime, funding, catalysts, action candidates in weekend mode", () => {
    const out = formatMorningBrief(makeInput({ mode: "weekend", asOf: SAT_ASOF }));
    expect(out).toContain("🎯 *Macro Regime*");
    expect(out).toContain("📊 *Funding Rate Cluster");
    expect(out).toContain("⚠️ *Today's Catalysts*");
    expect(out).toContain("🎯 *Action Candidates*");
  });

  it("header shows (Sat) day-of-week", () => {
    const out = formatMorningBrief(makeInput({ mode: "weekend", asOf: SAT_ASOF }));
    expect(out).toContain("\\(Sat\\)");
  });

  it("output stays under 4096 chars in weekend mode", () => {
    const out = formatMorningBrief(makeInput({ mode: "weekend", asOf: SAT_ASOF }));
    expect(out.length).toBeLessThan(4096);
  });

  it("escapes the period after 'Mon' (MarkdownV2 reserved char)", () => {
    const out = formatMorningBrief(makeInput({ mode: "weekend", asOf: SAT_ASOF }));
    expect(out).toMatch(/flows resume Mon\\\./);
  });
});
