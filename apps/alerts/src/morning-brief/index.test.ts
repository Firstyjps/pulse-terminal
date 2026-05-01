import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ETFFlowResponse } from "@pulse/sources";
import { classifyCluster, runMorningBrief } from "./index.js";
import {
  clearActionCandidatesCache,
  type FundingCluster,
} from "./action-candidates.js";

const MON = new Date("2026-05-04T02:00:00.000Z").getTime();
const SAT = new Date("2026-05-09T02:00:00.000Z").getTime();
const SUN = new Date("2026-05-10T02:00:00.000Z").getTime();

const HUB = "http://127.0.0.1:8081";
const TOKEN = "fake:token";
const CHAT = "12345";

const fakeEtf: ETFFlowResponse = {
  flows: [
    { date: "2026-05-02", btc: 100_000_000, eth: 5_000_000, btcCumulative: 30_000_000_000, ethCumulative: 4_000_000_000 },
    { date: "2026-05-03", btc: 245_300_000, eth: 12_400_000, btcCumulative: 30_245_300_000, ethCumulative: 4_012_400_000 },
  ],
  summary: {
    btcLast: 245_300_000, ethLast: 12_400_000,
    btcCumulative: 30_245_300_000, ethCumulative: 4_012_400_000,
    btc7dSum: 1_200_000_000, eth7dSum: 65_000_000,
    btc30dSum: 5_500_000_000, eth30dSum: 200_000_000,
  },
  _source: "farside", _isProxy: false,
};

const fakeRegime = {
  regime: "Risk-Off",
  score: -0.67,
  reason: "BTC dom rising",
  reading: { dominance: 57, dxy: 107 },
};

const fakeFunding: FundingCluster = {
  btc: -0.012, eth: -0.008, sol: -0.005,
  btcAnnualized: -13.14, ethAnnualized: -8.76, solAnnualized: -5.475,
  lean: "negative",
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => clearActionCandidatesCache());
afterEach(() => clearActionCandidatesCache());

describe("classifyCluster", () => {
  it("≥2 negative → negative lean", () => {
    expect(classifyCluster(-0.01, -0.02, 0.005).lean).toBe("negative");
  });
  it("≥2 positive → positive lean", () => {
    expect(classifyCluster(0.02, 0.01, -0.001).lean).toBe("positive");
  });
  it("1 each + 1 zero → mixed", () => {
    expect(classifyCluster(0.01, -0.01, 0).lean).toBe("mixed");
  });
  it("annualized = rate × 3 × 365", () => {
    const c = classifyCluster(0.01, 0, 0);
    expect(c.btcAnnualized).toBeCloseTo(10.95, 2);
  });
});

describe("runMorningBrief — skip rules", () => {
  it("skips on BKK Saturday", async () => {
    const r = await runMorningBrief({
      now: SAT, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf, fetchImpl: vi.fn(),
      fetchFunding: async () => fakeFunding,
      loadCatalysts: () => [],
    });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("weekend");
  });

  it("skips on BKK Sunday", async () => {
    const r = await runMorningBrief({
      now: SUN, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf, fetchImpl: vi.fn(),
      fetchFunding: async () => fakeFunding,
      loadCatalysts: () => [],
    });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("weekend");
  });

  it("skips when ETF _isProxy=true", async () => {
    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => ({ ...fakeEtf, _isProxy: true }),
      fetchFunding: async () => fakeFunding,
      loadCatalysts: () => [],
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(fakeRegime)),
    });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("proxy_data");
  });

  it("skips when ETF flows empty", async () => {
    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => ({ ...fakeEtf, flows: [] }),
      fetchFunding: async () => fakeFunding,
      loadCatalysts: () => [],
      fetchImpl: vi.fn(),
    });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("no_etf_data");
  });
});

describe("runMorningBrief — success path", () => {
  it("sends message + photo, returns sent:true with imageSent:true", async () => {
    let regimeCalled = false;
    let messageCalled = false;
    let photoCalled = false;
    const fetchImpl = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/regime")) {
        regimeCalled = true;
        return Promise.resolve(jsonResponse(fakeRegime));
      }
      if (url.includes("/sendMessage")) {
        messageCalled = true;
        // verify keyboard + MarkdownV2 in body
        const body = JSON.parse((init?.body as string) ?? "{}");
        expect(body.parse_mode).toBe("MarkdownV2");
        expect(body.reply_markup.inline_keyboard).toHaveLength(2);
        return Promise.resolve(jsonResponse({ ok: true, result: { message_id: 1 } }));
      }
      if (url.includes("/sendPhoto")) {
        photoCalled = true;
        expect(init?.body).toBeInstanceOf(FormData);
        return Promise.resolve(jsonResponse({ ok: true, result: { message_id: 2 } }));
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });

    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      dashboardUrl: "https://example.test/morning",
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      loadCatalysts: () => ["19:30 BKK — US CPI"],
      llmComplete: async () => "• cached LLM idea\nRisk: test",
      svgToPngImpl: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      fetchImpl,
    });

    expect(r.sent).toBe(true);
    expect(r.imageSent).toBe(true);
    expect(r.text).toContain("📊 *Pulse Morning Brief*");
    expect(r.text).toContain("• cached LLM idea");
    expect(r.text).toContain("19:30 BKK — US CPI");
    expect(regimeCalled).toBe(true);
    expect(messageCalled).toBe(true);
    expect(photoCalled).toBe(true);
  });

  it("text still sent when image (svgToPng) fails — sent:true, imageSent:false", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/regime")) return Promise.resolve(jsonResponse(fakeRegime));
      return Promise.resolve(jsonResponse({ ok: true, result: { message_id: 1 } }));
    });

    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      loadCatalysts: () => [],
      llmComplete: async () => "• idea\nRisk: x",
      svgToPngImpl: async () => null, // simulate resvg failure
      fetchImpl,
    });

    expect(r.sent).toBe(true);
    expect(r.imageSent).toBe(false);
    expect(r.imageError).toContain("svg-to-png");
  });

  it("returns send_failed when sendMessage fails", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/regime")) return Promise.resolve(jsonResponse(fakeRegime));
      if (url.includes("/sendMessage")) {
        return Promise.resolve(jsonResponse({ ok: false, description: "chat not found" }, false));
      }
      return Promise.resolve(jsonResponse({ ok: true, result: {} }));
    });

    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      loadCatalysts: () => [],
      llmComplete: async () => "• idea\nRisk: x",
      svgToPngImpl: async () => new Uint8Array([1]),
      fetchImpl,
    });

    expect(r.sent).toBe(false);
    expect(r.reason).toBe("send_failed");
    expect(r.error).toContain("chat not found");
    expect(r.text).toBeTypeOf("string");
  });

  it("falls back to default dashboard URL when not provided", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/regime")) return Promise.resolve(jsonResponse(fakeRegime));
      if (url.includes("/sendMessage")) {
        const body = JSON.parse((init?.body as string) ?? "{}");
        expect(body.reply_markup.inline_keyboard[0][0].url).toBe(
          "http://localhost:3000/morning",
        );
        return Promise.resolve(jsonResponse({ ok: true, result: { message_id: 1 } }));
      }
      return Promise.resolve(jsonResponse({ ok: true, result: {} }));
    });

    await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      loadCatalysts: () => [],
      llmComplete: async () => "• ok\nRisk: x",
      svgToPngImpl: async () => null,
      fetchImpl,
    });
  });
});
