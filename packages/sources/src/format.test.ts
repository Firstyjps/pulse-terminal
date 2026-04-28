import { describe, expect, it } from "vitest";
import {
  formatAprPct,
  formatExpiry,
  formatGreek,
  formatNumber,
  formatPercent,
  formatStrike,
  formatUSD,
} from "./format.js";

describe("formatUSD", () => {
  it("compact suffixes T/B/M/K", () => {
    expect(formatUSD(2.67e12)).toBe("$2.67T");
    expect(formatUSD(83e9)).toBe("$83.00B");
    expect(formatUSD(420e6)).toBe("$420.00M");
    expect(formatUSD(12_345)).toBe("$12.35K");
  });

  it("non-compact uses USD currency formatter", () => {
    expect(formatUSD(76_821, { compact: false })).toBe("$76,821.00");
  });

  it("returns em-dash for non-finite values", () => {
    expect(formatUSD(NaN)).toBe("—");
    expect(formatUSD(Infinity)).toBe("—");
  });

  it("respects custom decimals", () => {
    expect(formatUSD(2.67e12, { decimals: 1 })).toBe("$2.7T");
  });
});

describe("formatPercent", () => {
  it("prefixes positive with +", () => {
    expect(formatPercent(2.45)).toBe("+2.45%");
  });

  it("keeps negative sign", () => {
    expect(formatPercent(-1.07)).toBe("-1.07%");
  });

  it("zero has no leading sign", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });

  it("non-finite → em-dash", () => {
    expect(formatPercent(NaN)).toBe("—");
  });
});

describe("formatNumber", () => {
  it("compact sizes without $", () => {
    expect(formatNumber(1.5e9)).toBe("1.50B");
    expect(formatNumber(17_521, { compact: false })).toBe("17,521");
  });
});

describe("formatStrike", () => {
  it("leaves small strikes unchanged", () => {
    expect(formatStrike(78)).toBe("78");
    expect(formatStrike(425.5)).toBe("425.5");
  });

  it("compacts 1k+ strikes with single-decimal k suffix", () => {
    expect(formatStrike(2300)).toBe("2.3k");
    expect(formatStrike(120_000)).toBe("120.0k");
  });

  it("compacts million-scale strikes", () => {
    expect(formatStrike(1_500_000)).toBe("1.5M");
  });

  it("respects compact:false", () => {
    expect(formatStrike(120_000, { compact: false })).toBe("120,000");
  });

  it("returns em-dash for non-finite", () => {
    expect(formatStrike(NaN)).toBe("—");
  });
});

describe("formatGreek", () => {
  it("delta uses 2 decimals", () => {
    expect(formatGreek(0.5234, "delta")).toBe("0.52");
    expect(formatGreek(-0.5234, "delta")).toBe("-0.52");
  });

  it("gamma uses 4 decimals", () => {
    expect(formatGreek(0.0035, "gamma")).toBe("0.0035");
    expect(formatGreek(0.001234, "gamma")).toBe("0.0012");
  });

  it("theta + vega use 4 decimals", () => {
    expect(formatGreek(-12.3456, "theta")).toBe("-12.3456");
    expect(formatGreek(8.901, "vega")).toBe("8.9010");
  });

  it("signed:true prefixes positive values with +", () => {
    expect(formatGreek(0.42, "delta", { signed: true })).toBe("+0.42");
    expect(formatGreek(-0.42, "delta", { signed: true })).toBe("-0.42");
    expect(formatGreek(0, "delta", { signed: true })).toBe("0.00");
  });

  it("non-finite → em-dash", () => {
    expect(formatGreek(NaN, "delta")).toBe("—");
    expect(formatGreek(Infinity, "vega")).toBe("—");
  });
});

describe("formatAprPct", () => {
  it("appends APR suffix", () => {
    expect(formatAprPct(12.5)).toBe("12.50% APR");
    expect(formatAprPct(0)).toBe("0.00% APR");
  });

  it("respects custom decimals", () => {
    expect(formatAprPct(8.345, 1)).toBe("8.3% APR");
  });

  it("non-finite → em-dash", () => {
    expect(formatAprPct(NaN)).toBe("—");
  });
});

describe("formatExpiry", () => {
  it("absolute format: DDMMMYY uppercase", () => {
    expect(formatExpiry("2026-05-30")).toBe("30MAY26");
    expect(formatExpiry("2026-12-01")).toBe("01DEC26");
  });

  it("accepts epoch ms", () => {
    // 2026-05-30T00:00:00Z
    expect(formatExpiry(Date.UTC(2026, 4, 30))).toBe("30MAY26");
  });

  it("accepts Date instance", () => {
    expect(formatExpiry(new Date(Date.UTC(2026, 0, 5)))).toBe("05JAN26");
  });

  it("relative: 'Today' when same UTC day", () => {
    const now = new Date(Date.UTC(2026, 4, 30, 12, 0, 0));
    const expiry = new Date(Date.UTC(2026, 4, 30, 23, 30, 0));
    expect(formatExpiry(expiry, { relative: true, now })).toBe("Today");
  });

  it("relative: 'Tomorrow' for next-day expiry", () => {
    const now = new Date(Date.UTC(2026, 4, 30, 0, 0, 0));
    const expiry = new Date(Date.UTC(2026, 4, 31, 8, 0, 0));
    expect(formatExpiry(expiry, { relative: true, now })).toBe("Tomorrow");
  });

  it("relative: 'Nd' when within 7 days", () => {
    const now = new Date(Date.UTC(2026, 4, 30, 0, 0, 0));
    const expiry = new Date(Date.UTC(2026, 5, 4, 0, 0, 0)); // +5 days
    expect(formatExpiry(expiry, { relative: true, now })).toBe("5d");
  });

  it("relative: falls back to absolute beyond 7 days", () => {
    const now = new Date(Date.UTC(2026, 4, 1, 0, 0, 0));
    const expiry = new Date(Date.UTC(2026, 5, 30, 0, 0, 0)); // +60d
    expect(formatExpiry(expiry, { relative: true, now })).toBe("30JUN26");
  });

  it("invalid input → em-dash", () => {
    expect(formatExpiry("not-a-date")).toBe("—");
  });
});
