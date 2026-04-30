// Crypto news feed — aggregated from multiple free RSS feeds.
//
// CryptoPanic's previously-used `?public=true` endpoint returns 404 from
// datacenters as of 2026 (free tier now requires auth_token). Switched to
// raw RSS aggregation — no key, no rate limit, stable.
//
// Sources: CoinDesk · Decrypt · The Block · Bitcoin Magazine.

import { fetchJson } from "./_helpers.js";

export type NewsFilter = "all" | "BTC" | "ETH" | "hot" | "bullish" | "bearish";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number; // ms epoch
  /** Coin ticker tags (BTC/ETH/SOL…) extracted from title. */
  tickers: string[];
  /** Description / summary, plain-text, ~200 chars. */
  excerpt?: string;
  kind: "news";
}

interface FeedSource {
  name: string;
  url: string;
}

const FEEDS: FeedSource[] = [
  { name: "CoinDesk",         url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Decrypt",          url: "https://decrypt.co/feed" },
  { name: "The Block",        url: "https://www.theblock.co/rss.xml" },
  { name: "Bitcoin Magazine", url: "https://bitcoinmagazine.com/.rss/full/" },
];

const KNOWN_TICKERS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "TON",
  "TRX", "DOT", "LTC", "BCH", "MATIC", "POL", "ATOM", "NEAR", "APT", "ARB",
  "OP", "PEPE", "SHIB", "USDT", "USDC", "DAI", "WBTC",
];
const TICKER_RX = new RegExp(`\\b(${KNOWN_TICKERS.join("|")})\\b`, "g");

const TAG_RX = /<([a-zA-Z][\w:]*)([^>]*)>([\s\S]*?)<\/\1>/g;

/** Extract first occurrence of <tag>…</tag> (case-sensitive on tag name). */
function tag(xml: string, name: string): string | undefined {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = re.exec(xml);
  if (!m) return undefined;
  return m[1].trim();
}

function stripCDATA(s: string): string {
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml: string, source: string): NewsItem[] {
  // Split on <item>…</item> (RSS) or <entry>…</entry> (Atom)
  const items: string[] = [];
  const itemRx = /<(item|entry)\b[\s\S]*?<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRx.exec(xml))) items.push(m[0]);

  return items.slice(0, 20).map((block) => {
    const rawTitle = tag(block, "title") ?? "";
    const title = stripHtml(stripCDATA(rawTitle));
    const linkTag = tag(block, "link") ?? "";
    let url = stripHtml(stripCDATA(linkTag));
    if (!url) {
      // Atom: <link href="..."/>
      const m2 = /<link[^>]*\bhref=["']([^"']+)["']/i.exec(block);
      if (m2) url = m2[1];
    }
    const pub = tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated") ?? "";
    const ts = pub ? Date.parse(pub) : Date.now();
    const descRaw = tag(block, "description") ?? tag(block, "summary") ?? "";
    const excerpt = stripHtml(stripCDATA(descRaw)).slice(0, 220) || undefined;

    const tickers = Array.from(new Set(Array.from(title.matchAll(TICKER_RX)).map((m) => m[1])));

    // Use URL as id when present, fall back to title hash
    const id = url || `${source}:${title}`;

    return { id, title, url, source, publishedAt: Number.isFinite(ts) ? ts : Date.now(), tickers, excerpt, kind: "news" as const };
  });
}

/** Lightweight wrapper around fetch that returns the raw body or throws. */
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "Mozilla/5.0 (Pulse Terminal; +https://cryptopulse.buzz)",
    },
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Fetch + aggregate the latest items from every feed in parallel, then merge,
 * sort by publishedAt desc, and apply optional filter (BTC/ETH/hot/bullish/
 * bearish). For BTC/ETH the filter narrows to items mentioning that ticker.
 * For hot/bullish/bearish there is no semantic equivalent in plain RSS, so
 * those filters surface only items where one of the matched tickers exists
 * (proxy: news with explicit coin tags trends to be more market-impactful).
 */
export async function getCryptoNews(filter: NewsFilter = "all"): Promise<NewsItem[]> {
  const settled = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const xml = await fetchText(f.url);
      return parseRssItems(xml, f.name);
    }),
  );

  let merged: NewsItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") merged.push(...r.value);
  }
  merged.sort((a, b) => b.publishedAt - a.publishedAt);

  if (filter === "BTC") merged = merged.filter((n) => n.tickers.includes("BTC"));
  else if (filter === "ETH") merged = merged.filter((n) => n.tickers.includes("ETH"));
  else if (filter === "hot" || filter === "bullish" || filter === "bearish") {
    // Proxy: items with at least one ticker tag (more market-relevant)
    merged = merged.filter((n) => n.tickers.length > 0);
  }

  return merged.slice(0, 30);
}
