// Shared position types used by every DeFi adapter + the unified aggregator.
// Browser-safe — pure types only.

export type PositionType =
  | "spot"        // CEX spot balance
  | "lp"          // LP/CLMM/DLMM share — usually a pair
  | "lending"     // Aave/Compound supplied (positive)
  | "borrow"      // Aave/Compound borrowed (negative usdValue + units)
  | "yield_token" // Pendle PT, sUSDe, stETH wrappers
  | "perp";       // perpetual futures position

export interface Position {
  /** "binance" | "bybit" | "okx" | "meteora" | "pendle" | "orca" | "aave" */
  venue: string;
  type: PositionType;
  /** Single ticker, or pair (e.g. "SOL-USDC") for LP. */
  asset: string;
  /** Asset units; LP positions use 1 (logical share count). Borrow is negative. */
  units: number;
  /** Always in USD. Borrow positions are negative. */
  usdValue: number;
  /** Realized + unrealized PnL in USD if known by the venue. */
  pnl?: number;
  /** Venue-specific extras (wallet, chain, market address, in-range, etc.) */
  meta?: Record<string, unknown>;
}

export interface PositionResult {
  positions: Position[];
  /** Per-wallet/chain failures. Non-fatal: an empty positions list is still valid output. */
  errors?: string[];
}

/** Convenience: each DeFi source exposes a function with this signature. */
export type PositionFetcher = () => Promise<PositionResult>;
