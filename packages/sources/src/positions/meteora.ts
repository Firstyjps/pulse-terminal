// Meteora DLMM positions — Solana on-chain LP via Meteora's public dlmm-api.
// No wallet keys required; reads positions by owner address.
//
// Endpoint pattern: https://dlmm-api.meteora.ag/position/<wallet>
// Response is an array of position records (one per LB pair the wallet owns).
import type { Position, PositionResult } from "./types.js";
import { getSolanaWallets } from "../_wallets.js";

function meteoraApi(): string {
  return process.env.METEORA_API_URL ?? "https://dlmm-api.meteora.ag";
}

interface MeteoraTokenSide {
  symbol: string;
  amount: string;
  usdValue?: string;
}

interface MeteoraPositionRecord {
  pair: string;                  // e.g. "SOL-USDC"
  poolAddress: string;
  tokenX: MeteoraTokenSide;
  tokenY: MeteoraTokenSide;
  totalUsdValue: string;
  feesEarnedUsd?: string;
  inRange?: boolean;
}

/**
 * Fetch Meteora DLMM LP positions for every Solana wallet in `PULSE_WALLETS`.
 * Returns `{ positions: [] }` (NOT null) when no Solana wallets are configured —
 * every adapter shares this empty-but-valid contract so the aggregator can fan
 * out without per-source nullability checks.
 */
export async function getMeteoraPositions(): Promise<PositionResult> {
  const wallets = getSolanaWallets();
  if (wallets.length === 0) return { positions: [] };

  const positions: Position[] = [];
  const errors: string[] = [];

  for (const wallet of wallets) {
    try {
      const url = `${meteoraApi()}/position/${wallet}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        errors.push(`meteora ${wallet.slice(0, 6)}: HTTP ${res.status}`);
        continue;
      }
      const records = (await res.json()) as MeteoraPositionRecord[];
      if (!Array.isArray(records)) {
        errors.push(`meteora ${wallet.slice(0, 6)}: expected array, got ${typeof records}`);
        continue;
      }
      for (const r of records) {
        const usdValue = parseFloat(r.totalUsdValue || "0");
        const feesUsd = r.feesEarnedUsd ? parseFloat(r.feesEarnedUsd) : undefined;
        positions.push({
          venue: "meteora",
          type: "lp",
          asset: r.pair,
          units: 1,
          usdValue,
          pnl: feesUsd,
          meta: {
            wallet,
            chain: "solana",
            pool: r.poolAddress,
            inRange: r.inRange,
            tokenX: { symbol: r.tokenX.symbol, amount: parseFloat(r.tokenX.amount || "0") },
            tokenY: { symbol: r.tokenY.symbol, amount: parseFloat(r.tokenY.amount || "0") },
          },
        });
      }
    } catch (err) {
      errors.push(`meteora ${wallet.slice(0, 6)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return errors.length ? { positions, errors } : { positions };
}
