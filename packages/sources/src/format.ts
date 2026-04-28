// Number formatting — moved from CFA lib/format.ts so all packages share it.

export function formatUSD(value: number, options?: { compact?: boolean; decimals?: number }): string {
  const { compact = true, decimals = 2 } = options ?? {};
  if (!Number.isFinite(value)) return "—";

  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1e12) return `$${(value / 1e12).toFixed(decimals)}T`;
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(decimals)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(decimals)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(decimals)}K`;
  }

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
  });
}

export function formatNumber(value: number, options?: { compact?: boolean; decimals?: number }): string {
  const { compact = true, decimals = 2 } = options ?? {};
  if (!Number.isFinite(value)) return "—";

  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1e12) return `${(value / 1e12).toFixed(decimals)}T`;
    if (abs >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`;
    if (abs >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`;
    if (abs >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`;
  }

  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

// ────────────────────────────────────────────────────────────────────────
// Options + Bybit APR formatters — single source of truth so Desktop UI,
// Cursor's Phase 5A data layer, and @pulse/charts stay in lockstep.
// ────────────────────────────────────────────────────────────────────────

/** Strike price formatter. Compact above 1k (`78` → `78`, `2300` → `2.3k`, `120000` → `120k`). */
export function formatStrike(strike: number, options?: { compact?: boolean; decimals?: number }): string {
  const { compact = true, decimals = 1 } = options ?? {};
  if (!Number.isFinite(strike)) return "—";
  if (compact) {
    const abs = Math.abs(strike);
    if (abs >= 1e6) return `${(strike / 1e6).toFixed(decimals)}M`;
    if (abs >= 1e3) return `${(strike / 1e3).toFixed(decimals)}k`;
  }
  return strike.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

export type Greek = "delta" | "gamma" | "theta" | "vega" | "rho";

/**
 * Greek formatter. Each greek has its own canonical decimal width because
 * their natural magnitudes differ: delta/rho ∈ [-1, 1] (2dp), gamma small
 * (4dp), theta + vega per-day notional (4dp). Use `signed` to force a
 * leading `+` on positives.
 */
export function formatGreek(value: number, greek: Greek, options?: { signed?: boolean }): string {
  if (!Number.isFinite(value)) return "—";
  const { signed = false } = options ?? {};
  const decimals: Record<Greek, number> = { delta: 2, gamma: 4, theta: 4, vega: 4, rho: 4 };
  const fixed = value.toFixed(decimals[greek]);
  if (signed && value > 0) return `+${fixed}`;
  return fixed;
}

/**
 * APR percent formatter. Input is already in percent units (e.g. `12.5` = 12.5% APR),
 * not a decimal fraction. Use this for Bybit dual-asset, funding-as-APR, lending APR.
 */
export function formatAprPct(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}% APR`;
}

/**
 * Options expiry label. Accepts ISO date string ("2026-05-30"), epoch ms,
 * or Date. Format: `30MAY26` (Deribit-style), or `Today` / `Tomorrow` /
 * `Nd` (in N days) when `relative: true` and within 7 days.
 */
export function formatExpiry(
  expiry: string | number | Date,
  options?: { relative?: boolean; now?: Date },
): string {
  const { relative = false, now = new Date() } = options ?? {};
  const date = expiry instanceof Date ? expiry : new Date(expiry);
  if (Number.isNaN(date.getTime())) return "—";

  if (relative) {
    const ms = date.getTime() - now.getTime();
    const days = Math.round(ms / 86_400_000);
    if (days <= 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days <= 7) return `${days}d`;
  }

  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = months[date.getUTCMonth()];
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day}${month}${year}`;
}
