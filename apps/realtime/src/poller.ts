import { getFundingRates, getOpenInterest } from "@pulse/sources/server";
import type { PulseServer } from "./server.js";
import { normaliseSymbol } from "./cache.js";

const FUNDING_INTERVAL_MS = 60_000; // 1 min
const OI_INTERVAL_MS = 60_000;
const TRACKED_SYMBOLS = ["BTCUSDT", "ETHUSDT"];

/**
 * Polls @pulse/sources adapters and broadcasts updates to connected clients.
 * Native WS streams (binance/bybit/okx-stream.ts) cover the lowest-latency path
 * for those venues; this poller covers Deribit (no native stream yet) and
 * provides REST fallback when streams are toggled off via PULSE_NATIVE_STREAMS.
 */
export function startPollers(server: PulseServer): () => void {
  const fundingTimer = setInterval(async () => {
    try {
      const rates = await getFundingRates();
      for (const r of rates) {
        if (!TRACKED_SYMBOLS.includes(normaliseSymbol(r.symbol))) continue;
        server.broadcast({
          type: "funding",
          exchange: r.exchange,
          symbol: r.symbol,
          rate: r.rate,
          ratePercent: r.ratePercent,
          ts: r.ts,
        });
      }
    } catch (err) {
      console.warn("[poller] funding fetch failed:", err);
    }
  }, FUNDING_INTERVAL_MS);

  const oiTimer = setInterval(async () => {
    for (const symbol of TRACKED_SYMBOLS) {
      try {
        const ois = await getOpenInterest({ symbol });
        for (const o of ois) {
          server.broadcast({
            type: "oi",
            exchange: o.exchange,
            symbol: o.symbol,
            oi: o.oi,
            oiUsd: o.oiUsd,
            ts: o.ts,
          });
        }
      } catch (err) {
        console.warn(`[poller] oi fetch failed for ${symbol}:`, err);
      }
    }
  }, OI_INTERVAL_MS);

  return () => {
    clearInterval(fundingTimer);
    clearInterval(oiTimer);
  };
}
