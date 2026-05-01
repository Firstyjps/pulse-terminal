// Macro overlay — DXY, SPX, gold via Yahoo Finance public chart API.
// No API key required. UA spoofed because Yahoo blocks default fetch UA.

export interface MacroPoint {
  date: string; // ISO YYYY-MM-DD
  value: number;
}

export interface MacroSeries {
  symbol: string;
  label: string;
  current: number;
  change24h: number;       // percent
  history: MacroPoint[];   // last ~6 months daily
}

export interface MacroResponse {
  dxy: MacroSeries | null;
  spx: MacroSeries | null;
  gold: MacroSeries | null;
  generatedAt: string;
}

interface YahooResp {
  chart: {
    result?: Array<{
      meta: { regularMarketPrice: number; chartPreviousClose: number };
      timestamp: number[];
      indicators: { quote: Array<{ close: (number | null)[] }> };
    }>;
    error?: { code: string; description: string } | null;
  };
}

async function fetchYahoo(
  displaySymbol: string,
  yahooSymbol: string,
  label: string,
): Promise<MacroSeries | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=6mo&interval=1d`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 600 },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    } as RequestInit);
    if (!res.ok) return null;
    const json = (await res.json()) as YahooResp;
    const result = json.chart.result?.[0];
    if (!result) return null;

    const closes = result.indicators.quote[0]?.close ?? [];
    const stamps = result.timestamp ?? [];
    const history: MacroPoint[] = [];
    for (let i = 0; i < stamps.length; i++) {
      const v = closes[i];
      if (v == null) continue;
      history.push({ date: new Date(stamps[i] * 1000).toISOString().slice(0, 10), value: v });
    }
    if (!history.length) return null;

    const current = result.meta.regularMarketPrice;
    const prev = result.meta.chartPreviousClose;
    const change24h = prev > 0 ? ((current - prev) / prev) * 100 : 0;

    return { symbol: displaySymbol, label, current, change24h, history };
  } catch {
    return null;
  }
}

export async function getMacro(): Promise<MacroResponse> {
  const [dxy, spx, gold] = await Promise.all([
    fetchYahoo("DXY", "DX-Y.NYB", "US Dollar Index"),
    fetchYahoo("SPX", "^GSPC", "S&P 500"),
    fetchYahoo("GLD", "GC=F", "Gold (COMEX)"),
  ]);
  return { dxy, spx, gold, generatedAt: new Date().toISOString() };
}
