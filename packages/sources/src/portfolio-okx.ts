// Read-only portfolio sync — OKX V5 trading-account balance.
// Requires OKX_API_KEY + OKX_API_SECRET + OKX_API_PASSPHRASE. SAFE if keys are read-only.
//
// OKX V5 returns per-asset `eqUsd` already, so no price fetch needed.
import { createHmac } from "node:crypto";
import type { PortfolioBalance, PortfolioSnapshot } from "./portfolio.js";

interface OkxBalanceResponse {
  code: string;
  msg: string;
  data: Array<{
    totalEq: string;
    details: Array<{
      ccy: string;
      eq: string;
      cashBal: string;
      availBal: string;
      frozenBal: string;
      eqUsd: string;
    }>;
  }>;
}

function sign(secret: string, ts: string, method: string, path: string, body: string): string {
  // OKX V5: Base64(HMAC-SHA256(secret, timestamp + method + requestPath + body))
  const prehash = ts + method + path + body;
  return createHmac("sha256", secret).update(prehash).digest("base64");
}

/**
 * Fetch OKX V5 trading-account balance.
 * Returns null if API keys aren't configured (NOT an error — opt-in feature).
 */
export async function getOkxPortfolio(): Promise<PortfolioSnapshot | null> {
  const apiKey = process.env.OKX_API_KEY;
  const apiSecret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE;
  if (!apiKey || !apiSecret || !passphrase) return null;

  const ts = new Date().toISOString();
  const path = "/api/v5/account/balance";
  const signature = sign(apiSecret, ts, "GET", path, "");

  const url = `https://www.okx.com${path}`;
  const res = await fetch(url, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OKX account error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as OkxBalanceResponse;
  if (data.code !== "0") {
    throw new Error(`OKX code ${data.code}: ${data.msg}`);
  }

  const account = data.data[0];
  if (!account) {
    return { source: "okx", totalUsd: 0, balances: [], ts: Date.now() };
  }

  const balances: PortfolioBalance[] = account.details
    .map((d) => {
      const free = parseFloat(d.availBal || "0");
      const locked = parseFloat(d.frozenBal || "0");
      const total = parseFloat(d.eq || d.cashBal || "0");
      const usd = parseFloat(d.eqUsd || "0");
      return {
        asset: d.ccy,
        free,
        locked,
        total,
        usdValue: usd > 0 ? usd : undefined,
      };
    })
    .filter((b) => b.total > 0)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  const totalUsd = parseFloat(account.totalEq || "0");

  return {
    source: "okx",
    totalUsd,
    balances,
    ts: Date.now(),
  };
}
