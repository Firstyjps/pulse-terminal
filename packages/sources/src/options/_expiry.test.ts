import { describe, expect, it } from "vitest";
import { formatExpiry, normalizeExpiry } from "./_expiry.js";

describe("normalizeExpiry", () => {
  it("normalizes Deribit/Bybit dayMONyy with single-digit day", () => {
    expect(normalizeExpiry("3APR26")).toBe("20260403");
  });

  it("normalizes Deribit/Bybit dayMONyy with two-digit day", () => {
    expect(normalizeExpiry("26JUN26")).toBe("20260626");
  });

  it("normalizes Binance YYMMDD compact format", () => {
    expect(normalizeExpiry("260403")).toBe("20260403");
  });

  it("handles every month abbreviation correctly", () => {
    expect(normalizeExpiry("1JAN26")).toBe("20260101");
    expect(normalizeExpiry("1FEB26")).toBe("20260201");
    expect(normalizeExpiry("1MAR26")).toBe("20260301");
    expect(normalizeExpiry("1MAY26")).toBe("20260501");
    expect(normalizeExpiry("1JUL26")).toBe("20260701");
    expect(normalizeExpiry("1AUG26")).toBe("20260801");
    expect(normalizeExpiry("1SEP26")).toBe("20260901");
    expect(normalizeExpiry("1OCT26")).toBe("20261001");
    expect(normalizeExpiry("1NOV26")).toBe("20261101");
    expect(normalizeExpiry("1DEC26")).toBe("20261201");
  });

  it("returns input unchanged when format is unrecognized", () => {
    expect(normalizeExpiry("not-a-date")).toBe("not-a-date");
    expect(normalizeExpiry("")).toBe("");
  });

  it("falls back to month=01 for unknown month abbreviations", () => {
    // m[2] = "ZZZ" → MONTHS["ZZZ"] is undefined → "01"
    expect(normalizeExpiry("1ZZZ26")).toBe("20260101");
  });

  it("preserves sortability — dayMONyy and YYMMDD agree on the same day", () => {
    expect(normalizeExpiry("3APR26")).toBe(normalizeExpiry("260403"));
  });

  it("output is YYYYMMDD lexicographically sortable", () => {
    const dates = ["26DEC26", "3APR26", "1JAN26", "260403"]
      .map(normalizeExpiry)
      .sort();
    expect(dates).toEqual(["20260101", "20260403", "20260403", "20261226"]);
  });
});

describe("formatExpiry", () => {
  it("formats normalized YYYYMMDD as 'd Mon yy'", () => {
    expect(formatExpiry("20260403")).toBe("3 Apr 26");
  });

  it("normalizes then formats Deribit-style input", () => {
    expect(formatExpiry("3APR26")).toBe("3 Apr 26");
  });

  it("normalizes then formats Binance-style input", () => {
    expect(formatExpiry("260403")).toBe("3 Apr 26");
  });

  it("strips leading zeros from the day", () => {
    expect(formatExpiry("20260101")).toBe("1 Jan 26");
  });

  it("returns input unchanged when length is not 8 after normalize", () => {
    expect(formatExpiry("garbage")).toBe("garbage");
  });

  it("handles month boundary correctly", () => {
    expect(formatExpiry("20261231")).toBe("31 Dec 26");
    expect(formatExpiry("20260601")).toBe("1 Jun 26");
  });
});
