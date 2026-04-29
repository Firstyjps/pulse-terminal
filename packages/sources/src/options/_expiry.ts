// Expiry normalization — handles all 4 venues' string formats.

const MONTHS: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Normalize any expiry string to YYYYMMDD for consistent sorting/grouping.
 *   "3APR26"   → "20260403"  (Deribit/Bybit dayMONyy)
 *   "26JUN26"  → "20260626"
 *   "260403"   → "20260403"  (Binance YYMMDD)
 */
export function normalizeExpiry(raw: string): string {
  if (/^\d{6}$/.test(raw)) {
    return `20${raw.slice(0, 2)}${raw.slice(2, 4)}${raw.slice(4, 6)}`;
  }
  const m = raw.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (m) {
    return `20${m[3]}${MONTHS[m[2]] ?? "01"}${m[1].padStart(2, "0")}`;
  }
  return raw;
}

/** Format normalized YYYYMMDD as "3 Apr 26" */
export function formatExpiry(raw: string): string {
  const n = normalizeExpiry(raw);
  if (n.length !== 8) return raw;
  const day = parseInt(n.slice(6, 8), 10);
  const monthIdx = parseInt(n.slice(4, 6), 10) - 1;
  const yy = n.slice(2, 4);
  return `${day} ${MONTH_NAMES[monthIdx] ?? "???"} ${yy}`;
}
