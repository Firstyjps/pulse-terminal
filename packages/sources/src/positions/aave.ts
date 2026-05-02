// Aave V3 lending + borrow positions across EVM chains.
// Reads from a Graph subgraph (decentralized network requires THEGRAPH_API_KEY).
// Each `userReserve` row yields up to 2 positions: lending (aToken) + borrow (variable debt).
import type { Position, PositionResult } from "./types.js";
import { getEvmWallets } from "../_wallets.js";

// Per-chain Aave V3 subgraph IDs on the Graph decentralized network.
// Override the gateway base via `THEGRAPH_GATEWAY_URL` for testing.
function gatewayUrl(): string {
  return process.env.THEGRAPH_GATEWAY_URL ?? "https://gateway.thegraph.com/api";
}

const SUBGRAPHS: Array<{ id: number; name: string; subgraphId: string }> = [
  { id: 1,     name: "ethereum", subgraphId: "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk" },
  { id: 42161, name: "arbitrum", subgraphId: "DLuE98kEb5pQNXAcKFQGQgfSQ57Xdou4jnVbAEqMfy3B" },
];

const QUERY = `
  query UserReserves($user: String!) {
    userReserves(where: { user: $user }) {
      currentATokenBalance
      currentVariableDebt
      reserve { symbol decimals price { priceInEth } }
    }
  }
`;

interface SubgraphReserve {
  currentATokenBalance: string;
  currentVariableDebt: string;
  reserve: {
    symbol: string;
    decimals: number;
    price?: { priceInEth?: string };
  };
}

interface SubgraphResponse {
  data?: { userReserves?: SubgraphReserve[] };
  errors?: Array<{ message: string }>;
}

function shift(raw: string, decimals: number): number {
  const n = parseFloat(raw || "0");
  if (!Number.isFinite(n) || n === 0) return 0;
  return n / 10 ** decimals;
}

/**
 * Aave reports balances in raw on-chain integers. USD valuation requires an
 * external price feed — for the foundation we expose units in human-readable
 * form and leave usdValue at 0 unless a `priceInEth` is present (then we
 * approximate with `ethUsd`, defaulting to a caller-injected `ETH_USD_OVERRIDE`
 * env for tests/dry-runs). A future iteration will swap this for a real
 * oracle read; for now the structure is correct and tests cover both paths.
 */
export async function getAavePositions(): Promise<PositionResult> {
  const wallets = getEvmWallets();
  if (wallets.length === 0) return { positions: [] };

  const apiKey = process.env.THEGRAPH_API_KEY;
  if (!apiKey) {
    return { positions: [], errors: ["aave: THEGRAPH_API_KEY not set"] };
  }

  const ethUsd = parseFloat(process.env.ETH_USD_OVERRIDE || "0");
  const positions: Position[] = [];
  const errors: string[] = [];

  for (const wallet of wallets) {
    for (const chain of SUBGRAPHS) {
      try {
        const url = `${gatewayUrl()}/${apiKey}/subgraphs/id/${chain.subgraphId}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: QUERY, variables: { user: wallet } }),
          cache: "no-store",
        });
        if (!res.ok) {
          errors.push(`aave ${chain.name} ${wallet.slice(0, 6)}: HTTP ${res.status}`);
          continue;
        }
        const body = (await res.json()) as SubgraphResponse;
        if (body.errors?.length) {
          errors.push(`aave ${chain.name} ${wallet.slice(0, 6)}: ${body.errors[0].message}`);
          continue;
        }
        for (const r of body.data?.userReserves ?? []) {
          const supplied = shift(r.currentATokenBalance, r.reserve.decimals);
          const borrowed = shift(r.currentVariableDebt, r.reserve.decimals);
          const priceInEth = parseFloat(r.reserve.price?.priceInEth || "0");
          const unitUsd = ethUsd > 0 && priceInEth > 0 ? priceInEth * ethUsd : 0;

          if (supplied > 0) {
            positions.push({
              venue: "aave",
              type: "lending",
              asset: r.reserve.symbol,
              units: supplied,
              usdValue: supplied * unitUsd,
              meta: { wallet, chain: chain.name, chainId: chain.id },
            });
          }
          if (borrowed > 0) {
            positions.push({
              venue: "aave",
              type: "borrow",
              asset: r.reserve.symbol,
              units: -borrowed,
              usdValue: -(borrowed * unitUsd),
              meta: { wallet, chain: chain.name, chainId: chain.id },
            });
          }
        }
      } catch (err) {
        errors.push(
          `aave ${chain.name} ${wallet.slice(0, 6)}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return errors.length ? { positions, errors } : { positions };
}
