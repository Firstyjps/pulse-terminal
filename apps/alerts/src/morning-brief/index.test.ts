import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ETFFlowResponse } from "@pulse/sources";
import { classifyCluster, runMorningBrief } from "./index.js";
import {
  clearActionCandidatesCache,
  type FundingCluster,
} from "./action-candidates.js";
import type { KlineRow } from "./chart.js";

function makeKlines(n: number, slope = 100, startPrice = 60_000): KlineRow[] {
  const startTs = Date.UTC(2026, 4, 1);
  const rows: KlineRow[] = [];
  for (let i = 0; i < n; i++) {
    const close = startPrice + i * slope;
    rows.push({
      ts: startTs + i * 3_600_000,
      open: close - 5,
      high: close + 10,
      low: close - 10,
      close,
      volume: 100,
    });
  }
  return rows;
}

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

describe("runMorningBrief — weekday skip rules", () => {
  it("skips when ETF _isProxy=true (weekday)", async () => {
    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => ({ ...fakeEtf, _isProxy: true }),
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(fakeRegime)),
    });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("proxy_data");
    expect(r.mode).toBe("weekday");
  });

  it("skips when ETF flows empty (weekday)", async () => {
    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => ({ ...fakeEtf, flows: [] }),
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      fetchImpl: vi.fn(),
    });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("no_etf_data");
    expect(r.mode).toBe("weekday");
  });

  it("skips when ETF fetch rejects (weekday)", async () => {
    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => { throw new Error("upstream down"); },
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      fetchImpl: vi.fn(),
    });
    expect(r.skipped).toBe(true);
    expect(r.reason).toBe("no_etf_data");
    expect(r.mode).toBe("weekday");
  });
});

describe("runMorningBrief — weekend mode", () => {
  function makeFetchImpl(messageOk = true) {
    return vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/regime")) return Promise.resolve(jsonResponse(fakeRegime));
      if (url.includes("/sendMessage")) {
        return Promise.resolve(jsonResponse(messageOk ? { ok: true, result: { message_id: 1 } } : { ok: false, description: "fail" }, messageOk));
      }
      if (url.includes("/sendPhoto")) return Promise.resolve(jsonResponse({ ok: true, result: { message_id: 2 } }));
      return Promise.resolve(jsonResponse({ ok: true, result: {} }));
    });
  }

  it("sends weekend brief on BKK Saturday with mode:weekend + ⏸ ETF Status", async () => {
    const r = await runMorningBrief({
      now: SAT, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      llmComplete: async () => "• weekend idea\nRisk: thin liquidity",
      svgToPngImpl: async () => null,
      fetchImpl: makeFetchImpl(),
    });
    expect(r.sent).toBe(true);
    expect(r.mode).toBe("weekend");
    expect(r.text).toContain("⏸ *ETF Status*");
    expect(r.text).not.toContain("💰 *BTC ETF Flow*");
    expect(r.text).not.toContain("🔷 *ETH ETF Flow*");
    expect(r.text).toContain("\\(Sat\\)");
  });

  it("sends weekend brief on BKK Sunday", async () => {
    const r = await runMorningBrief({
      now: SUN, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      llmComplete: async () => "• weekend idea\nRisk: x",
      svgToPngImpl: async () => null,
      fetchImpl: makeFetchImpl(),
    });
    expect(r.sent).toBe(true);
    expect(r.mode).toBe("weekend");
    expect(r.text).toContain("\\(Sun\\)");
    expect(r.text).toContain("⏸ *ETF Status*");
  });

  it("weekend brief still sends when ETF fetch rejects (no_etf_data is not a skip on weekend)", async () => {
    const r = await runMorningBrief({
      now: SAT, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => { throw new Error("upstream down"); },
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      llmComplete: async () => "• idea\nRisk: x",
      svgToPngImpl: async () => null,
      fetchImpl: makeFetchImpl(),
    });
    expect(r.sent).toBe(true);
    expect(r.mode).toBe("weekend");
    expect(r.text).toContain("⏸ *ETF Status*");
    expect(r.text).not.toContain("Last reported"); // null etf → Case B
  });

  it("weekend brief still sends when ETF flows are empty", async () => {
    const r = await runMorningBrief({
      now: SAT, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => ({ ...fakeEtf, flows: [] }),
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      llmComplete: async () => "• idea\nRisk: x",
      svgToPngImpl: async () => null,
      fetchImpl: makeFetchImpl(),
    });
    expect(r.sent).toBe(true);
    expect(r.mode).toBe("weekend");
    expect(r.text).toContain("⏸ *ETF Status*");
    expect(r.text).not.toContain("Last reported");
  });

  it("weekend brief still sends when ETF is _isProxy=true", async () => {
    const r = await runMorningBrief({
      now: SAT, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => ({ ...fakeEtf, _isProxy: true }),
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      llmComplete: async () => "• idea\nRisk: x",
      svgToPngImpl: async () => null,
      fetchImpl: makeFetchImpl(),
    });
    expect(r.sent).toBe(true);
    expect(r.mode).toBe("weekend");
    expect(r.text).toContain("⏸ *ETF Status*");
    expect(r.text).not.toContain("Last reported"); // proxy treated as no-data
  });

  it("weekend brief sends image when klines are available (chart works 24/7 now)", async () => {
    const svgSpy = vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const r = await runMorningBrief({
      now: SAT, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => { throw new Error("upstream down"); },
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => makeKlines(168),
      loadCatalysts: () => [],
      llmComplete: async () => "• idea\nRisk: x",
      svgToPngImpl: svgSpy,
      fetchImpl: makeFetchImpl(),
    });
    expect(r.sent).toBe(true);
    expect(r.mode).toBe("weekend");
    expect(r.imageSent).toBe(true);
    expect(svgSpy).toHaveBeenCalledOnce();
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
      fetchKlines: async () => makeKlines(168),
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
      fetchKlines: async () => makeKlines(168),
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
      fetchKlines: async () => null,
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
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      llmComplete: async () => "• ok\nRisk: x",
      svgToPngImpl: async () => null,
      fetchImpl,
    });
  });

  it("brief sends image on weekday with valid klines (imageSent:true)", async () => {
    const photoSpy = vi.fn(async () => ({ ok: true, result: { message_id: 99 } }));
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/regime")) return Promise.resolve(jsonResponse(fakeRegime));
      if (url.includes("/sendMessage")) return Promise.resolve(jsonResponse({ ok: true, result: { message_id: 1 } }));
      if (url.includes("/sendPhoto")) return Promise.resolve(jsonResponse(photoSpy()));
      return Promise.resolve(jsonResponse({ ok: true, result: {} }));
    });

    const svgPngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const svgSpy = vi.fn(async (_svg: string) => svgPngBytes);

    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => makeKlines(168, 100, 60_000),
      loadCatalysts: () => [],
      llmComplete: async () => "• idea\nRisk: x",
      svgToPngImpl: svgSpy,
      fetchImpl,
    });

    expect(r.sent).toBe(true);
    expect(r.imageSent).toBe(true);
    expect(svgSpy).toHaveBeenCalledOnce();
    // The SVG passed to svgToPng is the new BTC price chart
    const svgArg = svgSpy.mock.calls[0][0];
    expect(svgArg).toContain("BTC/USD · 7D");
    expect(svgArg).toContain('width="1280"');
  });

  it("brief skips image when fetchKlines returns null (imageError:'no klines')", async () => {
    const svgSpy = vi.fn(async () => new Uint8Array([1]));
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/regime")) return Promise.resolve(jsonResponse(fakeRegime));
      if (url.includes("/sendMessage")) return Promise.resolve(jsonResponse({ ok: true, result: { message_id: 1 } }));
      return Promise.resolve(jsonResponse({ ok: true, result: {} }));
    });

    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => null,
      loadCatalysts: () => [],
      llmComplete: async () => "• idea\nRisk: x",
      svgToPngImpl: svgSpy,
      fetchImpl,
    });

    expect(r.sent).toBe(true);
    expect(r.imageSent).toBe(false);
    expect(r.imageError).toBe("no klines");
    expect(svgSpy).not.toHaveBeenCalled();
  });

  it("brief skips image when fetchKlines returns < 2 rows", async () => {
    const svgSpy = vi.fn(async () => new Uint8Array([1]));
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/regime")) return Promise.resolve(jsonResponse(fakeRegime));
      if (url.includes("/sendMessage")) return Promise.resolve(jsonResponse({ ok: true, result: { message_id: 1 } }));
      return Promise.resolve(jsonResponse({ ok: true, result: {} }));
    });

    const r = await runMorningBrief({
      now: MON, hubBase: HUB, telegramToken: TOKEN, chatId: CHAT,
      fetchEtf: async () => fakeEtf,
      fetchFunding: async () => fakeFunding,
      fetchKlines: async () => makeKlines(1),
      loadCatalysts: () => [],
      llmComplete: async () => "• idea\nRisk: x",
      svgToPngImpl: svgSpy,
      fetchImpl,
    });

    expect(r.sent).toBe(true);
    expect(r.imageSent).toBe(false);
    expect(r.imageError).toBe("no klines");
    expect(svgSpy).not.toHaveBeenCalled();
  });
});
