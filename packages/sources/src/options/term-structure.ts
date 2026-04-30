// Deribit IV term structure + OI snapshot — derives per-expiry ATM IV
// and aggregate open interest from the existing book-summary feed.
//
// Pure derivation: no extra API calls. Consumes `fetchDeribitOptions(asset)`
// and groups by `expiry`.

import { fetchDeribitOptions } from "./deribit.js";
import type { OptionAsset } from "./types.js";

export interface TermStructurePoint {
  expiry: string;
  /** Days-to-expiry from now (UTC, midnight rollover). */
  dte: number;
  /** Strike used as ATM reference (closest to underlying at that expiry). */
  atmStrike: number;
  /** ATM call IV (%, raw from mark_iv). 0 if missing. */
  atmCallIV: number;
  /** ATM put IV (%). 0 if missing. */
  atmPutIV: number;
  /** Average of call+put IV at ATM (or whichever side is present). */
  atmIV: number;
  /** Total OI at this expiry across all strikes/sides (contracts). */
  totalOI: number;
  callOI: number;
  putOI: number;
  callVol: number;
  putVol: number;
  /** Number of distinct strikes Deribit serves at this expiry. */
  strikeCount: number;
}

export interface OptionsTermStructure {
  asset: OptionAsset;
  underlyingPrice: number;
  /** Sorted by `dte` ascending (shortest-dated first). */
  termStructure: TermStructurePoint[];
  /** Aggregate stats across all expiries — handy for KPIs. */
  totals: {
    totalOI: number;
    callOI: number;
    putOI: number;
    putCallOIRatio: number;
    expiriesCount: number;
  };
  ts: number;
}

/** Days-to-expiry from a Deribit-style normalized YYYYMMDD or 'DDMMMYY' expiry string. */
function dteFor(expiry: string): number {
  // Try YYYYMMDD first
  let exp: Date | null = null;
  if (/^\d{8}$/.test(expiry)) {
    exp = new Date(
      Date.UTC(
        parseInt(expiry.slice(0, 4), 10),
        parseInt(expiry.slice(4, 6), 10) - 1,
        parseInt(expiry.slice(6, 8), 10),
        8, // Deribit settles 08:00 UTC
        0,
        0,
      ),
    );
  } else {
    // Fallback DDMMMYY (e.g. 26DEC25)
    const match = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(expiry);
    if (match) {
      const monthMap: Record<string, number> = {
        JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
        JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
      };
      const m = monthMap[match[2]];
      if (m != null) {
        exp = new Date(Date.UTC(2000 + parseInt(match[3], 10), m, parseInt(match[1], 10), 8));
      }
    }
  }
  if (!exp) return 0;
  return Math.max(0, (exp.getTime() - Date.now()) / 86_400_000);
}

/**
 * Build term structure for an asset on Deribit.
 *
 * For each expiry:
 *   - Pick the strike closest to the underlying price as ATM.
 *   - Record call+put IV at that strike.
 *   - Sum total OI and volume across all strikes/sides.
 */
export async function getOptionsTermStructure(asset: OptionAsset): Promise<OptionsTermStructure> {
  const { options, underlyingPrice } = await fetchDeribitOptions(asset);

  // Group by expiry → side → strike
  const byExpiry = new Map<string, typeof options>();
  for (const o of options) {
    const arr = byExpiry.get(o.expiry) ?? [];
    arr.push(o);
    byExpiry.set(o.expiry, arr);
  }

  const points: TermStructurePoint[] = [];
  let aggregateOI = 0;
  let aggregateCallOI = 0;
  let aggregatePutOI = 0;

  for (const [expiry, opts] of byExpiry) {
    const strikes = Array.from(new Set(opts.map((o) => o.strike))).sort((a, b) => a - b);
    if (strikes.length === 0) continue;

    // ATM strike = closest to underlying
    const atmStrike = strikes.reduce(
      (best, s) =>
        Math.abs(s - underlyingPrice) < Math.abs(best - underlyingPrice) ? s : best,
      strikes[0],
    );

    const atmCall = opts.find((o) => o.strike === atmStrike && o.side === "call");
    const atmPut = opts.find((o) => o.strike === atmStrike && o.side === "put");
    const atmCallIV = atmCall?.iv ?? 0;
    const atmPutIV = atmPut?.iv ?? 0;
    const sides = [atmCallIV, atmPutIV].filter((v) => v > 0);
    const atmIV = sides.length > 0 ? sides.reduce((a, b) => a + b, 0) / sides.length : 0;

    let callOI = 0, putOI = 0, callVol = 0, putVol = 0;
    for (const o of opts) {
      if (o.side === "call") {
        callOI += o.oi;
        callVol += o.volume;
      } else {
        putOI += o.oi;
        putVol += o.volume;
      }
    }
    const totalOI = callOI + putOI;
    aggregateOI += totalOI;
    aggregateCallOI += callOI;
    aggregatePutOI += putOI;

    points.push({
      expiry,
      dte: +dteFor(expiry).toFixed(2),
      atmStrike,
      atmCallIV: +atmCallIV.toFixed(2),
      atmPutIV: +atmPutIV.toFixed(2),
      atmIV: +atmIV.toFixed(2),
      totalOI,
      callOI,
      putOI,
      callVol,
      putVol,
      strikeCount: strikes.length,
    });
  }

  points.sort((a, b) => a.dte - b.dte);

  return {
    asset,
    underlyingPrice: +underlyingPrice.toFixed(2),
    termStructure: points,
    totals: {
      totalOI: aggregateOI,
      callOI: aggregateCallOI,
      putOI: aggregatePutOI,
      putCallOIRatio: aggregateCallOI > 0 ? +(aggregatePutOI / aggregateCallOI).toFixed(3) : 0,
      expiriesCount: points.length,
    },
    ts: Date.now(),
  };
}
