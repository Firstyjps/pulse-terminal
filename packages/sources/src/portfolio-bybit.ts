// Read-only portfolio sync — Bybit V5 unified-account wallet balance.
// Requires BYBIT_API_KEY + BYBIT_API_SECRET. SAFE if keys are read-only.
//
// Bybit V5 wallet response is pre-priced (per-coin `usdValue`), so we do NOT
// need a separate price fetch.
import { createHmac } from "node:crypto";
import type { PortfolioBalance, PortfolioSnapshot } from "./portfolio.js";

interface BybitWalletResponse {
  retCode: number;
  retMsg: string;
  result: {
    list: Array<{
      accountType: string;
      totalEquity: string;
      totalAvailableBalance: string;
      coin: Array<{
        coin: string;
        equity: string;
        walletBalance: string;
        free: string;
        locked: string;
        usdValue: string;
      }>;
    }>;
  };
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Fetch unified-account spot wallet balances from Bybit V5.
 * Returns null if API keys aren't configured (NOT an error — opt-in feature).
 */
export async function getBybitPortfolio(): Promise<PortfolioSnapshot | null> {
  const apiKey = process.env.BYBIT_API_KEY;
  const apiSecret = process.env.BYBIT_API_SECRET;
  if (!apiKey || !apiSecret) return null;

  const ts = Date.now().toString();
  const recvWindow = "10000";
  const query = "accountType=UNIFIED";
  // Bybit V5 GET signature: timestamp + apiKey + recvWindow + queryString
  const signature = sign(apiSecret, ts + apiKey + recvWindow + query);

  const url = `https://api.bybit.com/v5/account/wallet-balance?${query}`;
  const res = await fetch(url, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN": signature,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bybit account error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as BybitWalletResponse;
  if (data.retCode !== 0) {
    throw new Error(`Bybit retCode ${data.retCode}: ${data.retMsg}`);
  }

  const account = data.result.list[0];
  if (!account) {
    return { source: "bybit", totalUsd: 0, balances: [], ts: Date.now() };
  }

  const balances: PortfolioBalance[] = account.coin
    .map((c) => {
      const free = parseFloat(c.free || c.walletBalance || "0");
      const locked = parseFloat(c.locked || "0");
      const total = parseFloat(c.equity || c.walletBalance || "0");
      const usd = parseFloat(c.usdValue || "0");
      return {
        asset: c.coin,
        free,
        locked,
        total,
        usdValue: usd > 0 ? usd : undefined,
      };
    })
    .filter((b) => b.total > 0)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  const totalUsd = parseFloat(account.totalEquity || "0");

  return {
    source: "bybit",
    totalUsd,
    balances,
    ts: Date.now(),
  };
}
