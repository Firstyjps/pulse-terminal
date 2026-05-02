// Orca Whirlpool (CLMM) LP positions on Solana.
// NOTE: Orca has no first-party REST endpoint for "positions by wallet" —
// canonical reads go through the Whirlpool program via Solana RPC + the
// Anchor decoder. For the Phase 6 foundation we accept a pluggable URL
// (`ORCA_API_URL`) pointing at any service that exposes the documented
// shape below; if unset, we fall through to a placeholder default.
import type { Position, PositionResult } from "./types.js";
import { getSolanaWallets } from "../_wallets.js";

function orcaApi(): string {
  return process.env.ORCA_API_URL ?? "https://api.mainnet.orca.so";
}

interface OrcaWhirlpoolPosition {
  positionMint: string;
  whirlpool: string;
  tokenA: { symbol: string; amount: string };
  tokenB: { symbol: string; amount: string };
  valueUsd: string;
  feesEarnedUsd?: string;
  inRange?: boolean;
}

interface OrcaPositionsResponse {
  positions?: OrcaWhirlpoolPosition[];
}

export async function getOrcaPositions(): Promise<PositionResult> {
  const wallets = getSolanaWallets();
  if (wallets.length === 0) return { positions: [] };

  const positions: Position[] = [];
  const errors: string[] = [];

  for (const wallet of wallets) {
    try {
      const url = `${orcaApi()}/v1/whirlpool/positions/${wallet}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        errors.push(`orca ${wallet.slice(0, 6)}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as OrcaPositionsResponse;
      for (const p of data.positions ?? []) {
        const usdValue = parseFloat(p.valueUsd || "0");
        positions.push({
          venue: "orca",
          type: "lp",
          asset: `${p.tokenA.symbol}-${p.tokenB.symbol}`,
          units: 1,
          usdValue,
          pnl: p.feesEarnedUsd ? parseFloat(p.feesEarnedUsd) : undefined,
          meta: {
            wallet,
            chain: "solana",
            whirlpool: p.whirlpool,
            positionMint: p.positionMint,
            inRange: p.inRange,
            tokenA: { symbol: p.tokenA.symbol, amount: parseFloat(p.tokenA.amount || "0") },
            tokenB: { symbol: p.tokenB.symbol, amount: parseFloat(p.tokenB.amount || "0") },
          },
        });
      }
    } catch (err) {
      errors.push(`orca ${wallet.slice(0, 6)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return errors.length ? { positions, errors } : { positions };
}
