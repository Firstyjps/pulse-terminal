import { z } from "zod";
import {
  scanAnomalies,
  buildGradeSignalRubric,
  type AnomalyFinding,
} from "@pulse/sources/server";

import { json, type RegisterFn } from "../_helpers.js";

const FindingSchema = z.object({
  category: z.enum([
    "etf",
    "stablecoin",
    "funding",
    "futures",
    "tvl",
    "dex",
    "options",
    "bybit",
  ]),
  severity: z.enum(["low", "med", "high"]),
  signal: z.string(),
  evidence: z.record(z.unknown()).default({}),
});

export const registerIntelligenceTools: RegisterFn = (server) => {
  server.tool(
    "detect_anomalies",
    "Cross-source anomaly scan. Pulls a fresh fund-flow snapshot plus funding rates " +
      "and emits a list of pattern findings (e.g. ETF outflow + funding spike, " +
      "stablecoin supply surge + TVL drop). Useful for nightly digest or alerting. " +
      "Returns at most ~10 findings ranked by severity. Logic shared with the " +
      "alerts worker and the web /api/alerts/scan route.",
    {
      symbol: z
        .string()
        .optional()
        .default("BTCUSDT")
        .describe("Symbol to source funding rate from. Default BTCUSDT."),
    },
    async ({ symbol = "BTCUSDT" }) => {
      const scan = await scanAnomalies(symbol);
      return json({
        generatedAt: scan.generatedAt,
        count: scan.findings.length,
        findings: scan.findings.slice(0, 10),
        marker: scan.marker,
        _hint:
          scan.findings.length === 0
            ? "no anomalies detected — markets quiet across the tracked dimensions"
            : undefined,
      });
    },
  );

  // Phase 4 — grade_signal (rubric-returner pattern).
  // We don't use MCP sampling/elicitation to round-trip back through Claude:
  // host support for sampling is uneven across Claude Desktop versions, and a
  // pure rubric-return is more debuggable. The tool hands Claude a structured
  // rubric + the required output schema; Claude does the grading in-place
  // and is told (in `instructions`) to return ONLY a JSON object matching the
  // schema. Hit-rate enrichment from the alerts JSONL is a v2 enhancement —
  // keeping v1 pure means latency stays sub-50ms.
  server.tool(
    "grade_signal",
    "Grade an anomaly finding from `detect_anomalies`. Returns a structured " +
      "rubric (weights, formula, considerations specific to the finding's category) " +
      "plus the required output schema. After receiving this rubric, reply with " +
      "ONLY a JSON object matching outputSchema — do not echo the rubric back, do " +
      "not wrap in code fences. Use the rubric's category-specific considerations " +
      "and the severity confidence band as anchors. Typical chain: " +
      "detect_anomalies → pick a finding → grade_signal {finding} → produce " +
      "{confidence, reasoning, suggested_action, risk_flags}.",
    {
      finding: FindingSchema.describe(
        "An AnomalyFinding object — typically copied verbatim from detect_anomalies output.",
      ),
      market_context: z
        .record(z.unknown())
        .optional()
        .describe(
          "Optional macro context (BTC price, regime label, recent moves). Improves grading; " +
            "if omitted the rubric instructs the model to flag the absence in risk_flags.",
        ),
    },
    async ({ finding, market_context }) => {
      const rubric = buildGradeSignalRubric(
        finding as AnomalyFinding,
        market_context ?? null,
      );
      return json(rubric);
    },
  );
};
