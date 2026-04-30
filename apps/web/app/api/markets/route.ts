import { fetchJson } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 60;

interface CGMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  sparkline_in_7d?: { price: number[] };
}

// Stablecoins / dollar-pegs — the user trades volatile assets, so these
// shouldn't crowd out the Top Movers list. Maintained as an explicit
// allow-it-out set rather than a price-peg heuristic so that depegs
// (USDC March 2023, etc.) still get surfaced if they ever happen to enter
// the top 50 rank list.
const STABLECOIN_SYMBOLS = new Set([
  "USDT", "USDC", "USDS", "DAI", "BUSD", "TUSD", "FDUSD", "PYUSD",
  "USDP", "USDD", "USDE", "FRAX", "GUSD", "LUSD", "MIM",  "SUSD",
  "USDB", "ALUSD", "NUSD", "HUSD", "RAI",  "PAX", "USDX", "EURS",
  "EURT", "EUROC", "CUSD", "USTB", "USD0",
]);

function isLegitCrypto(c: CGMarket): boolean {
  const sym = c.symbol.toUpperCase();
  // Tokenized stocks / HELOCs / receipts often ship CoinGecko entries with
  // an underscore or period in the symbol (e.g. FIGR_HELOC, AAPL.X). Drop
  // those — they're not meaningful price movers in a crypto terminal.
  if (/[_.]/.test(c.symbol)) return false;
  if (STABLECOIN_SYMBOLS.has(sym)) return false;
  return true;
}

export async function GET() {
  try {
    // Pull a wider candidate pool (50) so that after filtering stablecoins
    // and tokenized noise we still land ~20 legit names.
    const raw = await fetchJson<CGMarket[]>(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=1h%2C24h%2C7d",
      { revalidate: 60 },
    );
    const filtered = raw.filter(isLegitCrypto).slice(0, 20);
    return Response.json(filtered);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
