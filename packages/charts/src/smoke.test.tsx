import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Sparkline } from "./Sparkline";
import { DepthChart } from "./DepthChart";
import { FlowAreaChart, FlowBarChart } from "./FlowAreaChart";
import { FlowChart } from "./FlowChart";
import { Candlestick } from "./Candlestick";

import { IVSmile } from "./IVSmile";
import { OIByStrike } from "./OIByStrike";
import { GreeksHeatmap } from "./GreeksHeatmap";
import { FundingHistory } from "./FundingHistory";

import { RegimeChip } from "./RegimeChip";
import { PortfolioSparkline } from "./PortfolioSparkline";

import {
  SAMPLE_FUNDING_HISTORY,
  SAMPLE_GREEKS_ROWS,
  SAMPLE_IV_POINTS,
  SAMPLE_IV_POINTS_FLAT,
  SAMPLE_OI_POINTS,
  SAMPLE_SPOT,
} from "./__fixtures__/options-sample";

/** Render a component to static HTML and assert it produced something non-empty. */
function renders(node: React.ReactElement): string {
  const html = renderToStaticMarkup(node);
  expect(typeof html).toBe("string");
  expect(html.length).toBeGreaterThan(0);
  return html;
}

// ────────────────────────────────────────────────────────────────────────
// Existing components — guard against regressions during refactor
// ────────────────────────────────────────────────────────────────────────

describe("Sparkline", () => {
  it("renders an SVG with polyline for non-trivial data", () => {
    const html = renders(<Sparkline data={[1, 2, 3, 4, 5, 4, 6]} positive />);
    expect(html).toContain("<svg");
    expect(html).toContain("polyline");
  });

  it("renders N/A label for fewer than 2 points", () => {
    const html = renders(<Sparkline data={[1]} />);
    expect(html).toContain("N/A");
  });

  it("renders N/A label for empty data", () => {
    const html = renders(<Sparkline data={[]} />);
    expect(html).toContain("N/A");
  });
});

describe("DepthChart", () => {
  it("renders without throwing for normal bid/ask levels", () => {
    renders(
      <DepthChart
        bids={[
          { price: 100, size: 50 },
          { price: 99, size: 80 },
        ]}
        asks={[
          { price: 101, size: 40 },
          { price: 102, size: 70 },
        ]}
      />,
    );
  });

  it("handles empty arrays without throwing", () => {
    renders(<DepthChart bids={[]} asks={[]} />);
  });
});

describe("FlowAreaChart + FlowBarChart", () => {
  it("FlowAreaChart renders for sample series", () => {
    renders(
      <FlowAreaChart
        data={[
          { date: "2026-04-01", value: 1.2e9 },
          { date: "2026-04-02", value: 1.4e9 },
          { date: "2026-04-03", value: 1.1e9 },
        ]}
      />,
    );
  });

  it("FlowBarChart renders for sample series", () => {
    renders(
      <FlowBarChart
        data={[
          { date: "2026-04-01", value: 250e6 },
          { date: "2026-04-02", value: -120e6 },
        ]}
      />,
    );
  });
});

describe("FlowChart wrapper", () => {
  it("renders for stablecoin type", () => {
    renders(
      <FlowChart
        type="stablecoin"
        data={[
          { date: "2026-04-01", value: 165e9 },
          { date: "2026-04-02", value: 167e9 },
        ]}
      />,
    );
  });
});

describe("Candlestick", () => {
  it("renders an empty container without throwing (lightweight-charts is client-side only)", () => {
    const html = renders(
      <Candlestick
        data={[
          { time: 1_745_000_000, open: 100, high: 110, low: 95, close: 105 },
          { time: 1_745_086_400, open: 105, high: 115, low: 100, close: 112 },
        ]}
      />,
    );
    expect(html).toContain("<div");
  });
});

// ────────────────────────────────────────────────────────────────────────
// Phase 5A options components — added 2026-04-28
// ────────────────────────────────────────────────────────────────────────

describe("IVSmile", () => {
  it("renders the empty-state hint when given no points", () => {
    const html = renders(<IVSmile data={[]} />);
    expect(html).toContain("No IV data");
  });

  it("renders for a flat (single-curve) series", () => {
    renders(<IVSmile data={SAMPLE_IV_POINTS_FLAT} spot={SAMPLE_SPOT} />);
  });

  it("renders for split call/put data and auto-detects sides", () => {
    renders(<IVSmile data={SAMPLE_IV_POINTS} spot={SAMPLE_SPOT} />);
  });

  it("respects splitSides=false even when sides are present in data", () => {
    renders(<IVSmile data={SAMPLE_IV_POINTS} splitSides={false} />);
  });
});

describe("OIByStrike", () => {
  it("renders the empty-state hint when given no points", () => {
    const html = renders(<OIByStrike data={[]} />);
    expect(html).toContain("No OI data");
  });

  it("renders for sample data side-by-side", () => {
    renders(<OIByStrike data={SAMPLE_OI_POINTS} spot={SAMPLE_SPOT} />);
  });

  it("renders for sample data in mirror mode", () => {
    renders(<OIByStrike data={SAMPLE_OI_POINTS} mirror spot={SAMPLE_SPOT} />);
  });
});

describe("GreeksHeatmap", () => {
  it("renders the empty-state hint when given no rows", () => {
    const html = renders(<GreeksHeatmap data={[]} />);
    expect(html).toContain("No Greeks data");
  });

  it("renders strike + side + 4 greek columns for both sides by default", () => {
    const html = renders(<GreeksHeatmap data={SAMPLE_GREEKS_ROWS} spot={SAMPLE_SPOT} />);
    expect(html).toContain("strike");
    expect(html).toContain("delta");
    expect(html).toContain("gamma");
    expect(html).toContain("theta");
    expect(html).toContain("vega");
  });

  it("filters to call side only when side='call'", () => {
    const html = renders(<GreeksHeatmap data={SAMPLE_GREEKS_ROWS} side="call" />);
    // Side column suppressed when filtering to one side
    expect(html).not.toMatch(/>SIDE</i);
  });

  it("respects custom greeks subset", () => {
    const html = renders(<GreeksHeatmap data={SAMPLE_GREEKS_ROWS} greeks={["delta", "gamma"]} />);
    expect(html).toContain("delta");
    expect(html).toContain("gamma");
    expect(html).not.toContain("theta");
  });
});

describe("FundingHistory", () => {
  it("renders the empty-state hint when given no points", () => {
    const html = renders(<FundingHistory data={[]} />);
    expect(html).toContain("No APR history");
  });

  it("renders for sample APR history with threshold", () => {
    renders(<FundingHistory data={SAMPLE_FUNDING_HISTORY} threshold={10} />);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Morning Brief components — added 2026-05-01
// ────────────────────────────────────────────────────────────────────────

describe("RegimeChip", () => {
  it("renders the uppercased label + the reason text", () => {
    const html = renders(
      <RegimeChip regime="risk-on" reason="BTC > 200d MA, ETF inflows positive" />,
    );
    expect(html).toContain("RISK-ON");
    expect(html).toContain("ETF inflows positive");
  });

  it("truncates reasons longer than maxReasonLength with an ellipsis", () => {
    const long = "x".repeat(200);
    const html = renders(<RegimeChip regime="range" reason={long} maxReasonLength={40} />);
    expect(html).toContain("…");
    // The visible body (after the last "…</span>") should not contain the full
    // long string. The full reason still appears in the `title` attribute for
    // hover tooltips, so we extract just the visible span body.
    const visibleMatch = html.match(/>([x]+)…<\/span>/);
    expect(visibleMatch).not.toBeNull();
    expect(visibleMatch![1].length).toBeLessThan(40);
  });

  it("renders the asOf suffix when provided", () => {
    const html = renders(
      <RegimeChip regime="risk-off" reason="VIX > 25" asOf="2026-05-01 09:00" />,
    );
    expect(html).toContain("2026-05-01 09:00");
  });

  it("uses a distinct label per regime", () => {
    expect(renders(<RegimeChip regime="risk-on" reason="" />)).toContain("RISK-ON");
    expect(renders(<RegimeChip regime="risk-off" reason="" />)).toContain("RISK-OFF");
    expect(renders(<RegimeChip regime="range" reason="" />)).toContain("RANGE");
  });
});

describe("PortfolioSparkline", () => {
  it("renders sparkline svg + signed USD + percent + window label for non-trivial data", () => {
    const html = renders(
      <PortfolioSparkline
        points={[100, 110, 105, 120, 115, 130]}
        window="24h"
        deltaUsd={3000}
        deltaPct={3.0}
      />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("polyline");
    // Window text is lowercase in the DOM; visual uppercasing is via CSS text-transform.
    expect(html).toContain(">24h<");
    expect(html).toContain("$3.0K");
    expect(html).toContain("3.00%");
  });

  it("delegates to Sparkline empty-state when fewer than 2 points are provided", () => {
    const html = renders(
      <PortfolioSparkline points={[1]} window="7d" deltaUsd={0} deltaPct={0} />,
    );
    expect(html).toContain("N/A");
    // labels are suppressed in empty state to avoid showing fake deltas
    expect(html).not.toContain("$");
    expect(html).not.toContain(">7d<");
  });

  it("compact mode hides the inline delta + window labels", () => {
    const html = renders(
      <PortfolioSparkline
        points={[100, 110, 105]}
        window="30d"
        deltaUsd={500}
        deltaPct={1.5}
        compact
      />,
    );
    expect(html).toContain("polyline");
    expect(html).not.toContain(">30d<");
    expect(html).not.toContain("$");
  });

  it("formats negative deltas with a unicode minus", () => {
    const html = renders(
      <PortfolioSparkline
        points={[100, 95, 90]}
        window="7d"
        deltaUsd={-500}
        deltaPct={-5}
      />,
    );
    expect(html).toContain("polyline");
    expect(html).toContain("−$500");
    expect(html).toContain("−5.00%");
  });
});
