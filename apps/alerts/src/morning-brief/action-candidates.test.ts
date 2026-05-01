import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ETFFlowResponse } from "@pulse/sources";
import {
  clearActionCandidatesCache,
  generateActionCandidates,
  type ActionCandidatesInput,
  type FundingCluster,
  type LlmComplete,
} from "./action-candidates.js";

const NOW = new Date("2026-05-04T02:00:00.000Z").getTime(); // 09:00 BKK Mon

const ETF_FIXTURE: ETFFlowResponse = {
  flows: [],
  summary: {
    btcLast: 245_300_000, ethLast: 12_400_000,
    btcCumulative: 30_245_300_000, ethCumulative: 4_012_400_000,
    btc7dSum: 1_200_000_000, eth7dSum: 65_000_000,
    btc30dSum: 5_500_000_000, eth30dSum: 200_000_000,
  },
  _source: "farside", _isProxy: false,
};

const FUNDING_NEG: FundingCluster = {
  btc: -0.012, eth: -0.008, sol: -0.005,
  btcAnnualized: -13.14, ethAnnualized: -8.76, solAnnualized: -5.475,
  lean: "negative",
};

function input(overrides: Partial<ActionCandidatesInput> = {}): ActionCandidatesInput {
  return {
    regime: { regime: "Risk-Off", score: -0.67, reason: "BTC dom rising" },
    etf: ETF_FIXTURE,
    funding: FUNDING_NEG,
    catalysts: ["19:30 BKK — US CPI"],
    ...overrides,
  };
}

beforeEach(() => clearActionCandidatesCache());
afterEach(() => clearActionCandidatesCache());

describe("generateActionCandidates — LLM path", () => {
  it("calls injected LLM with Thai-instructing system prompt + serialized data + caches result", async () => {
    // Mock LLM returns Thai sample (LLM is instructed to output Thai with English tech terms)
    const thaiSample =
      "• พิจารณา BTC ETF เนื่องจาก 24h inflow $245.3M สวนทางกับ funding negative\n" +
      "• ETH mean-revert watch: 7d flow +$65.0M แม้ regime Risk-Off\n" +
      "Risk: ตลาดอาจกลับตัวเร็วถ้า DXY แข็งค่ารุนแรง";
    const llm: LlmComplete = vi.fn().mockResolvedValue(thaiSample);
    const out = await generateActionCandidates(input(), { complete: llm, now: NOW });

    expect(out).toBe(thaiSample);
    expect(llm).toHaveBeenCalledTimes(1);
    const [system, user] = (llm as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    // Prompt instructs Thai output but keeps "quant trading analyst" framing
    expect(system).toContain("quant trading analyst");
    expect(system).toContain("ACTION CANDIDATES");
    expect(system).toContain("Thai");
    expect(system).toContain("BTC, ETH, SOL, ETF, funding"); // tech-term whitelist
    // User payload stays English (it's structured data — only the LLM reply is Thai)
    expect(user).toContain("Regime: Risk-Off");
    expect(user).toContain("BTC ETF: 24h +$245.3M");
    expect(user).toContain("Funding 8h: BTC -0.012%");
    expect(user).toContain("Today's catalysts: 19:30 BKK — US CPI");

    // Second call same date+regime returns cached value, no second LLM call
    const out2 = await generateActionCandidates(input(), { complete: llm, now: NOW });
    expect(out2).toBe(out);
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("falls back to rules when LLM throws — output is Thai with English tech terms", async () => {
    const llm: LlmComplete = vi.fn().mockRejectedValue(new Error("API down"));
    const out = await generateActionCandidates(input(), { complete: llm, now: NOW });
    // Rules detect: negative funding + Risk-Off → harvest setup (Thai prose, English terms)
    expect(out).toContain("พิจารณา funding harvest");
    expect(out).toContain("long spot, short perp"); // tech terms stay English
    expect(out).toContain("Risk: rules-based fallback");
    expect(out).toContain("ไม่พร้อมใช้งาน"); // Thai risk caveat
  });

  it("falls back to rules when LLM returns empty string", async () => {
    const llm: LlmComplete = vi.fn().mockResolvedValue("   ");
    const out = await generateActionCandidates(input(), { complete: llm, now: NOW });
    expect(out).toContain("พิจารณา funding harvest");
  });

  it("falls back when no LLM provider configured and no completer injected", async () => {
    // Clear both LLM_PROVIDER and ANTHROPIC_API_KEY so callLLM resolves to "none" → null
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevProvider = process.env.LLM_PROVIDER;
    const prevKey = process.env.LLM_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_API_KEY;
    try {
      const out = await generateActionCandidates(input(), { now: NOW });
      expect(out).toContain("Risk: rules-based fallback");
    } finally {
      if (prevAnthropic) process.env.ANTHROPIC_API_KEY = prevAnthropic;
      if (prevProvider) process.env.LLM_PROVIDER = prevProvider;
      if (prevKey) process.env.LLM_API_KEY = prevKey;
    }
  });
});

describe("generateActionCandidates — rules fallback (Thai)", () => {
  it("emits funding harvest in Thai when funding negative + regime Risk-Off", async () => {
    const out = await generateActionCandidates(input(), { now: NOW });
    expect(out).toContain("พิจารณา funding harvest: long spot, short perp");
    expect(out).toContain("cluster lean negative");
  });

  it("emits ETH mean-revert watch in Thai when 7d ETH ETF positive in Risk-Off", async () => {
    const out = await generateActionCandidates(input(), { now: NOW });
    expect(out).toContain("ETH mean-revert watch");
    expect(out).toContain("+65.0M"); // 65_000_000 / 1e6 — number kept verbatim
    expect(out).toContain("regime Risk-Off");
    expect(out).toContain("สวนทาง"); // Thai
  });

  it("emits leverage-reduction (Thai) when catalyst within 6h", async () => {
    // 09:00 BKK now, 14:00 BKK catalyst = 5h away → triggers
    const out = await generateActionCandidates(
      input({ catalysts: ["14:00 BKK — FOMC minutes"] }),
      { now: NOW },
    );
    expect(out).toContain("ลด leverage ก่อน");
    expect(out).toContain("FOMC minutes");
  });

  it("does NOT emit leverage-reduction when catalyst is past or outside 6h window", async () => {
    // 09:00 now, 04:00 catalyst = past
    const past = await generateActionCandidates(
      input({ catalysts: ["04:00 BKK — already happened"] }),
      { now: NOW, cacheBust: true },
    );
    expect(past).not.toContain("ลด leverage ก่อน 04:00");

    clearActionCandidatesCache();

    // 09:00 now, 18:00 catalyst = 9h away (outside 6h window)
    const far = await generateActionCandidates(
      input({ catalysts: ["18:00 BKK — too far"] }),
      { now: NOW, cacheBust: true },
    );
    expect(far).not.toContain("ลด leverage ก่อน 18:00");
  });

  it("emits Thai 'no clear setup' when no rules trigger", async () => {
    const out = await generateActionCandidates(
      {
        regime: { regime: "Range", score: 0, reason: "neutral" },
        etf: { ...ETF_FIXTURE, summary: { ...ETF_FIXTURE.summary, eth7dSum: 0 } },
        funding: { ...FUNDING_NEG, lean: "mixed" },
        catalysts: [],
      },
      { now: NOW },
    );
    expect(out).toContain("ไม่มีสัญญาณชัดเจน");
    expect(out).toContain("รอดู");
  });
});
