export const TRACKED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
export type TrackedSymbol = typeof TRACKED_SYMBOLS[number];

export function isTrackedSymbol(symbol: string): symbol is TrackedSymbol {
  return (TRACKED_SYMBOLS as readonly string[]).includes(symbol);
}
