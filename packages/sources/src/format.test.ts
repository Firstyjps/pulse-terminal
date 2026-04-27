import { describe, expect, it } from "vitest";
import { formatNumber, formatPercent, formatUSD } from "./format.js";

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
