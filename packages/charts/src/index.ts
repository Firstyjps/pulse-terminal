// @pulse/charts — public exports

export { Sparkline } from "./Sparkline";
export type { SparklineProps } from "./Sparkline";

export { PortfolioSparkline } from "./PortfolioSparkline";
export type {
  PortfolioSparklineProps,
  PortfolioWindow,
} from "./PortfolioSparkline";

export { PortfolioTrend } from "./PortfolioTrend";
export type {
  PortfolioTrendProps,
  PortfolioSnapshot,
} from "./PortfolioTrend";

export { RegimeChip } from "./RegimeChip";
export type { RegimeChipProps, Regime } from "./RegimeChip";

export { Candlestick } from "./Candlestick";
export type { Candle, CandlestickProps } from "./Candlestick";

export { PriceLine } from "./PriceLine";
export type { PriceLinePoint, PriceLineProps } from "./PriceLine";

export { FlowAreaChart, FlowBarChart } from "./FlowAreaChart";
export type {
  FlowPoint,
  FlowAreaChartProps,
  FlowBarPoint,
  FlowBarChartProps,
} from "./FlowAreaChart";

export { FlowChart } from "./FlowChart";
export type { FlowChartProps, FlowChartType } from "./FlowChart";

export { DepthChart } from "./DepthChart";
export type { DepthChartProps, DepthLevel } from "./DepthChart";

export { IVSmile } from "./IVSmile";
export type { IVSmileProps, IVPoint } from "./IVSmile";

export { OIByStrike } from "./OIByStrike";
export type { OIByStrikeProps, OIPoint } from "./OIByStrike";

export { GreeksHeatmap } from "./GreeksHeatmap";
export type { GreeksHeatmapProps, GreeksRow, Greek } from "./GreeksHeatmap";

export { FundingHistory } from "./FundingHistory";
export type { FundingHistoryProps, FundingPoint } from "./FundingHistory";

// Sample fixtures — synthetic data for showcase / debugging.
// Tree-shaken if unused.
export {
  SAMPLE_SPOT,
  SAMPLE_EXPIRY,
  SAMPLE_IV_POINTS,
  SAMPLE_IV_POINTS_FLAT,
  SAMPLE_OI_POINTS,
  SAMPLE_GREEKS_ROWS,
  SAMPLE_FUNDING_HISTORY,
  SAMPLE_OPTION_BUNDLE,
} from "./__fixtures__/options-sample";
