import { describe, expect, it } from "vitest";
import { summarizeSnapshot } from "./snapshot.js";
import type { FundflowSnapshot } from "./types.js";

const FIXED_TS = "2026-04-28T12:00:00.000Z";

function emptySnap(): FundflowSnapshot {
  return { generatedAt: FIXED_TS };
}

describe("summarizeSnapshot", () => {
  it("includes the generatedAt timestamp and analysis mode", () => {
    const md = summarizeSnapshot(emptySnap(), "macro");
    expect(md).toContain(`# Fund Flow Snapshot — ${FIXED_TS}`);
    expect(md).toContain("Analysis mode: macro");
  });

  it("defaults mode to 'overview' when omitted", () => {
    expect(summarizeSnapshot(emptySnap())).toContain("Analysis mode: overview");
  });

  it("renders the overview section when present", () => {
    const snap: FundflowSnapshot = {
      ...emptySnap(),
      overview: {
        totalMarketCap: 2.67e12,
        totalVolume24h: 83e9,
        btcDominance: 56.4,
        ethDominance: 18.2,
        marketCapChange24h: -1.07,
        activeCryptocurrencies: 12345,
        defiMarketCap: 95e9,
        defiTvl: 110e9,
        fearGreedIndex: { value: 65, classification: "Greed" },
      },
    };
    const md = summarizeSnapshot(snap);
    expect(md).toContain("## Market Overview");
    expect(md).toContain("$2.67T");
    expect(md).toContain("(24h: -1.07%)");
    expect(md).toContain("BTC Dominance: 56.40%");
    expect(md).toContain("Fear & Greed Index: 65 (Greed)");
    expect(md).toContain("Active Cryptocurrencies: 12,345");
  });

  it("omits Fear & Greed line when fearGreedIndex is missing", () => {
    const snap: FundflowSnapshot = {
      ...emptySnap(),
      overview: {
        totalMarketCap: 1e12,
        totalVolume24h: 50e9,
        btcDominance: 50,
        ethDominance: 20,
        marketCapChange24h: 0,
        activeCryptocurrencies: 1000,
        defiMarketCap: 0,
        defiTvl: 0,
      },
    };
    const md = summarizeSnapshot(snap);
    expect(md).toContain("## Market Overview");
    expect(md).not.toContain("Fear & Greed Index");
  });

  it("flags ETF section as proxy data when _isProxy is true", () => {
    const snap: FundflowSnapshot = {
      ...emptySnap(),
      etf: {
        flows: [],
        summary: {
          btcLast: 250e6,
          ethLast: 50e6,
          btcCumulative: 30e9,
          ethCumulative: 5e9,
          btc7dSum: 1.2e9,
          eth7dSum: 200e6,
          btc30dSum: 4.5e9,
          eth30dSum: 800e6,
        },
        _isProxy: true,
      },
    };
    const md = summarizeSnapshot(snap);
    expect(md).toContain("## ETF Flows (Proxy data — no Coinglass key)");
  });

  it("does not flag proxy when _isProxy is absent", () => {
    const snap: FundflowSnapshot = {
      ...emptySnap(),
      etf: {
        flows: [],
        summary: {
          btcLast: 0,
          ethLast: 0,
          btcCumulative: 0,
          ethCumulative: 0,
          btc7dSum: 0,
          eth7dSum: 0,
          btc30dSum: 0,
          eth30dSum: 0,
        },
      },
    };
    const md = summarizeSnapshot(snap);
    expect(md).toContain("## ETF Flows\n");
    expect(md).not.toContain("Proxy data");
  });

  it("renders stablecoins with correct sign prefix on positive change", () => {
    const snap: FundflowSnapshot = {
      ...emptySnap(),
      stablecoins: {
        history: [],
        summary: {
          currentTotal: 165e9,
          change7d: 1.2e9,
          change7dPercent: 0.73,
          change30d: -3.5e9,
          change30dPercent: -2.1,
          dominance: [
            { name: "USDT", mcap: 100e9, pct: 60.6 },
            { name: "USDC", mcap: 35e9, pct: 21.2 },
          ],
        },
      },
    };
    const md = summarizeSnapshot(snap);
    expect(md).toContain("7d change: +$1.20B (0.73%)");
    expect(md).toContain("30d change: $-3.50B (-2.10%)");
    expect(md).toContain("USDT 60.6%, USDC 21.2%");
  });

  it("renders futures BTC + ETH lines when futures present", () => {
    const snap: FundflowSnapshot = {
      ...emptySnap(),
      futures: {
        btc: {
          symbol: "BTCUSDT",
          openInterest: 8.5e9,
          fundingRate: 0.0125,
          longShortRatio: 1.34,
          price: 76821,
          priceChange24h: 1.5,
          history: [],
        },
        eth: {
          symbol: "ETHUSDT",
          openInterest: 4.2e9,
          fundingRate: -0.0034,
          longShortRatio: 0.92,
          price: 2312,
          priceChange24h: -0.8,
          history: [],
        },
      },
    };
    const md = summarizeSnapshot(snap);
    expect(md).toContain("## Futures (Binance)");
    expect(md).toContain("BTC: $76,821");
    expect(md).toContain("Funding 0.0125%");
    expect(md).toContain("ETH: $2,312");
    expect(md).toContain("Funding -0.0034%");
  });

  it("skips sections that are undefined on the snapshot", () => {
    // empty snapshot only renders the title + mode line
    const md = summarizeSnapshot(emptySnap());
    expect(md).not.toContain("## Market Overview");
    expect(md).not.toContain("## Stablecoin Flows");
    expect(md).not.toContain("## ETF Flows");
    expect(md).not.toContain("## Futures");
    expect(md).not.toContain("## DEX Activity");
    expect(md).not.toContain("## DeFi TVL");
  });
});
