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
