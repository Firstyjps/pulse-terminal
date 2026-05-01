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
  it("calls injected LLM with system + serialized data + caches result", async () => {
    const llm: LlmComplete = vi.fn().mockResolvedValue("• Buy the dip\n• Short funding\nRisk: high vol");
    const out = await generateActionCandidates(input(), { complete: llm, now: NOW });

    expect(out).toContain("• Buy the dip");
    expect(llm).toHaveBeenCalledTimes(1);
    const [system, user] = (llm as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(system).toContain("quant trading analyst");
    expect(system).toContain("ACTION CANDIDATES");
    expect(user).toContain("Regime: Risk-Off");
    expect(user).toContain("BTC ETF: 24h +$245.3M");
    expect(user).toContain("Funding 8h: BTC -0.012%");
    expect(user).toContain("Today's catalysts: 19:30 BKK — US CPI");

    // Second call same date+regime returns cached value, no second LLM call
    const out2 = await generateActionCandidates(input(), { complete: llm, now: NOW });
    expect(out2).toBe(out);
    expect(llm).toHaveBeenCalledTimes(1);
  });

  it("falls back to rules when LLM throws", async () => {
    const llm: LlmComplete = vi.fn().mockRejectedValue(new Error("API down"));
    const out = await generateActionCandidates(input(), { complete: llm, now: NOW });
    // Rules detect: negative funding + Risk-Off → harvest setup
    expect(out).toContain("Funding harvest candidate");
    expect(out).toContain("Risk: rules-based fallback");
  });

  it("falls back to rules when LLM returns empty string", async () => {
    const llm: LlmComplete = vi.fn().mockResolvedValue("   ");
    const out = await generateActionCandidates(input(), { complete: llm, now: NOW });
    expect(out).toContain("Funding harvest candidate");
  });

  it("falls back when ANTHROPIC_API_KEY missing and no completer injected", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const out = await generateActionCandidates(input(), { now: NOW });
    expect(out).toContain("Risk: rules-based fallback");
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });
});

describe("generateActionCandidates — rules fallback", () => {
  it("emits funding harvest when funding negative + regime Risk-Off", async () => {
    const out = await generateActionCandidates(input(), { now: NOW });
    expect(out).toContain("Funding harvest candidate: long spot, short perp");
  });

  it("emits ETH mean-revert watch when 7d ETH ETF positive in Risk-Off", async () => {
    const out = await generateActionCandidates(input(), { now: NOW });
    expect(out).toContain("Mean-revert watch on ETH");
    expect(out).toContain("+65.0M"); // 65_000_000 / 1e6
  });

  it("emits leverage-reduction when catalyst within 6h", async () => {
    // 09:00 BKK now, 14:00 BKK catalyst = 5h away → triggers
    const out = await generateActionCandidates(
      input({ catalysts: ["14:00 BKK — FOMC minutes"] }),
      { now: NOW },
    );
    expect(out).toContain("Reduce leverage before");
    expect(out).toContain("FOMC minutes");
  });

  it("does NOT emit leverage-reduction when catalyst is past or outside 6h window", async () => {
    // 09:00 now, 04:00 catalyst = past
    const past = await generateActionCandidates(
      input({ catalysts: ["04:00 BKK — already happened"] }),
      { now: NOW, cacheBust: true },
    );
    expect(past).not.toContain("Reduce leverage before 04:00");

    clearActionCandidatesCache();

    // 09:00 now, 18:00 catalyst = 9h away (outside 6h window)
    const far = await generateActionCandidates(
      input({ catalysts: ["18:00 BKK — too far"] }),
      { now: NOW, cacheBust: true },
    );
    expect(far).not.toContain("Reduce leverage before 18:00");
  });

  it("emits 'No clear setup' when no rules trigger", async () => {
    const out = await generateActionCandidates(
      {
        regime: { regime: "Range", score: 0, reason: "neutral" },
        etf: { ...ETF_FIXTURE, summary: { ...ETF_FIXTURE.summary, eth7dSum: 0 } },
        funding: { ...FUNDING_NEG, lean: "mixed" },
        catalysts: [],
      },
      { now: NOW },
    );
    expect(out).toContain("No clear setup — observe");
  });
});
