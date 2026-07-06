// MCP tool: render_brief_chart — reuses Pulse's existing SVG→PNG chart engine
// (apps/alerts/src/morning-brief/chart.ts, resvg-based, no headless browser).
// Exposes BTC 7d price chart + BTC ETF flows bar chart as PNG so any AI agent
// (KhunQuant, Hermes) can attach them to a market brief.
import { z } from "zod";
import {
  fetchBtcKlines7d,
  buildBtcPriceChartSvg,
  buildBtcEtfFlowsBarChartSvg,
  svgToPng,
} from "@pulse/alerts/morning-brief/chart";
import { getETFFlows } from "@pulse/sources/server";
import type { RegisterFn } from "../_helpers.js";

function pngImage(png: Uint8Array) {
  return {
    content: [
      {
        type: "image" as const,
        data: Buffer.from(png).toString("base64"),
        mimeType: "image/png",
      },
    ],
  };
}

function errText(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export const registerBriefChartTools: RegisterFn = (server) => {
  server.tool(
    "render_brief_chart",
    "Render a market chart as a PNG image (base64) for attaching to a brief. " +
      "chart_type='btc_price' = BTC/USD 7d hourly price chart. " +
      "chart_type='etf_flows' = BTC spot ETF daily flow bar chart. " +
      "Returns an image the agent can send directly (e.g. Telegram sendPhoto).",
    {
      chart_type: z
        .enum(["btc_price", "etf_flows"])
        .describe("Which chart to render"),
    },
    async ({ chart_type }) => {
      try {
        let svg: string;
        if (chart_type === "btc_price") {
          const klines = await fetchBtcKlines7d();
          if (!klines || klines.length === 0)
            return errText("no BTC kline data available");
          svg = buildBtcPriceChartSvg(klines);
        } else {
          const etf = await getETFFlows();
          const flows = etf?.flows ?? [];
          if (!flows.length) return errText("no ETF flow data available");
          svg = buildBtcEtfFlowsBarChartSvg(flows);
        }
        const png = await svgToPng(svg);
        if (!png) return errText("chart render failed (resvg unavailable)");
        return pngImage(png);
      } catch (err) {
        return errText(`render_brief_chart error: ${(err as Error).message}`);
      }
    },
  );
};
