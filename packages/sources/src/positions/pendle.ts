// Pendle PT/YT/LP positions across supported EVM chains.
// Endpoint: https://api-v2.pendle.finance/core/v1/dashboard/positions/<chainId>/<address>
//
// Pendle's dashboard API is read-only and unauthenticated. We poll each
// supported chain per wallet; failures on one chain do not block others.
import type { Position, PositionResult } from "./types.js";
import { getEvmWallets } from "../_wallets.js";

function pendleApi(): string {
  return process.env.PENDLE_API_URL ?? "https://api-v2.pendle.finance";
}

const CHAINS: Array<{ id: number; name: string }> = [
  { id: 1,     name: "ethereum" },
  { id: 42161, name: "arbitrum" },
  { id: 56,    name: "bsc" },
  { id: 10,    name: "optimism" },
];

interface PendlePtPosition {
  symbol: string;
  balance: string;          // PT units, decimal string
  valuation?: { valuation?: string };
  pnl?: string;
  expiry?: string;
  marketAddress?: string;
}

interface PendleDashboardResponse {
  openPositions?: PendlePtPosition[];
  closedPositions?: PendlePtPosition[];
}

export async function getPendlePositions(): Promise<PositionResult> {
  const wallets = getEvmWallets();
  if (wallets.length === 0) return { positions: [] };

  const positions: Position[] = [];
  const errors: string[] = [];

  for (const wallet of wallets) {
    for (const chain of CHAINS) {
      try {
        const url = `${pendleApi()}/core/v1/dashboard/positions/${chain.id}/${wallet}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          errors.push(`pendle ${chain.name} ${wallet.slice(0, 6)}: HTTP ${res.status}`);
          continue;
        }
        const data = (await res.json()) as PendleDashboardResponse;
        for (const pt of data.openPositions ?? []) {
          const usdValue = parseFloat(pt.valuation?.valuation || "0");
          if (usdValue <= 0) continue;
          positions.push({
            venue: "pendle",
            type: "yield_token",
            asset: pt.symbol || "PT",
            units: parseFloat(pt.balance || "0"),
            usdValue,
            pnl: pt.pnl ? parseFloat(pt.pnl) : undefined,
            meta: {
              wallet,
              chain: chain.name,
              chainId: chain.id,
              expiry: pt.expiry,
              market: pt.marketAddress,
            },
          });
        }
      } catch (err) {
        errors.push(
          `pendle ${chain.name} ${wallet.slice(0, 6)}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return errors.length ? { positions, errors } : { positions };
}
