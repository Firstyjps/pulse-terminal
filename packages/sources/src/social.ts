// Social buzz — Reddit hot posts (when OAuth keys are configured) with a
// CoinGecko trending-searches fallback for unauthenticated environments.
//
// Reddit's public JSON endpoints reject server-side requests from datacenter
// IPs. The official path requires OAuth2 client credentials. We try OAuth
// when REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are set, and fall back to
// CoinGecko's `/search/trending` (community attention signal — free, no key)
// otherwise so the panel still shows useful data on a fresh deploy.

import { fetchJson } from "./_helpers.js";

export interface SocialMention {
  ticker: string;
  /** Times the ticker appeared (Reddit) or trending rank slot (CoinGecko). */
  mentions: number;
  /** Aggregate score (Reddit upvotes × ln(comments+1); or CoinGecko trend score). */
  score: number;
  /** Best-engagement post title or coin display name. */
  topPostTitle: string;
  topPostUrl: string;
  topPostScore: number;
}

export interface SocialBuzzResponse {
  /** Top-N tickers ranked by score, descending. */
  top: SocialMention[];
  /** Total posts/items scanned. */
  scanned: number;
  /** Per-source status (visibility for the UI). */
  sources: { ok: string[]; fail: string[] };
  /** Which path produced the data — used by UI to label the panel. */
  path: "reddit" | "coingecko-trending";
  ts: number;
}

// ── Reddit OAuth path ──────────────────────────────────────────────────────

const SUBS: { name: string; limit: number }[] = [
  { name: "CryptoCurrency", limit: 25 },
  { name: "Bitcoin",        limit: 15 },
  { name: "ethfinance",     limit: 15 },
];

const TICKER_BLACKLIST = new Set([
  "ALL", "AND", "ANY", "ASK", "BAN", "BET", "BIG", "BUT", "BUY", "CAN",
  "CEO", "CFO", "CTO", "CUT", "DAY", "DIE", "EVE", "FAQ", "FED", "FEE",
  "FOR", "FUD", "FYI", "GET", "GOT", "HAS", "HOT", "ICO", "IMF", "IPO",
  "JOB", "LET", "LOL", "LOW", "MAY", "NEW", "NFT", "NOT", "NOW", "OFF",
  "OFFER", "OUR", "OUT", "PAY", "PER", "PLUS", "POW", "POS", "PRO", "PUT",
  "RUN", "SAY", "SEC", "SEE", "SHE", "TAX", "TBA", "THE", "TIP", "TLD",
  "TOP", "TRY", "USD", "USE", "WAY", "WHO", "WHY", "WIN", "YES",
  "EUR", "GBP", "JPY", "CNY", "CAD", "AUD",
  "ATH", "ATL", "DEX", "CEX", "DAO", "ETF", "AMM", "OTC", "TOR", "VPN",
]);
const TICKER_RX = /\$?\b([A-Z]{3,6})\b/g;

const UA = "Mozilla/5.0 (Pulse Terminal; +https://cryptopulse.buzz)";

interface RedditChild {
  data: {
    title: string;
    permalink: string;
    score?: number;
    num_comments?: number;
    link_flair_text?: string;
  };
}
interface RedditListing {
  data?: { children?: RedditChild[] };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getRedditToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`reddit token HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("reddit token missing");
  cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function fetchSubHotOAuth(sub: string, limit: number, token: string): Promise<RedditChild[]> {
  const res = await fetch(`https://oauth.reddit.com/r/${sub}/hot?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`oauth.reddit/${sub}: HTTP ${res.status}`);
  const json = (await res.json()) as RedditListing;
  return json.data?.children ?? [];
}

interface Bucket {
  ticker: string;
  mentions: number;
  score: number;
  topPostTitle: string;
  topPostUrl: string;
  topPostScore: number;
}

async function getRedditBuzz(token: string): Promise<SocialBuzzResponse> {
  const ok: string[] = [];
  const fail: string[] = [];
  const all: RedditChild[] = [];

  const settled = await Promise.allSettled(SUBS.map((s) => fetchSubHotOAuth(s.name, s.limit, token)));
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      ok.push(SUBS[i].name);
      all.push(...r.value);
    } else {
      fail.push(`${SUBS[i].name}: ${(r.reason as Error)?.message ?? "?"}`);
    }
  });

  const buckets = new Map<string, Bucket>();
  for (const c of all) {
    const title = c.data.title ?? "";
    const flair = c.data.link_flair_text ?? "";
    const upvotes = c.data.score ?? 0;
    const comments = c.data.num_comments ?? 0;
    const engagement = upvotes * Math.log(comments + 1);
    if (engagement <= 0) continue;
    const seen = new Set<string>();
    for (const m of `${title} ${flair}`.matchAll(TICKER_RX)) {
      const t = m[1];
      if (TICKER_BLACKLIST.has(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      const cur = buckets.get(t) ?? {
        ticker: t,
        mentions: 0,
        score: 0,
        topPostTitle: title,
        topPostUrl: `https://www.reddit.com${c.data.permalink}`,
        topPostScore: upvotes,
      };
      cur.mentions += 1;
      cur.score += engagement;
      if (upvotes > cur.topPostScore) {
        cur.topPostScore = upvotes;
        cur.topPostTitle = title;
        cur.topPostUrl = `https://www.reddit.com${c.data.permalink}`;
      }
      buckets.set(t, cur);
    }
  }

  const top = [...buckets.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((b) => ({
      ticker: b.ticker,
      mentions: b.mentions,
      score: Math.round(b.score),
      topPostTitle: b.topPostTitle.slice(0, 60),
      topPostUrl: b.topPostUrl,
      topPostScore: b.topPostScore,
    }));

  return { top, scanned: all.length, sources: { ok, fail }, path: "reddit", ts: Date.now() };
}

// ── CoinGecko trending fallback ────────────────────────────────────────────

interface CGTrendingItem {
  item: {
    id: string;
    name: string;
    symbol: string;
    market_cap_rank?: number;
    score?: number;
    data?: {
      price_change_percentage_24h?: { usd?: number };
      total_volume?: string;
    };
  };
}
interface CGTrendingResp {
  coins?: CGTrendingItem[];
}

async function getCoinGeckoTrending(): Promise<SocialBuzzResponse> {
  const json = await fetchJson<CGTrendingResp>(
    "https://api.coingecko.com/api/v3/search/trending",
    { revalidate: 600, retries: 1 },
  );
  const coins = json.coins ?? [];

  // CoinGecko returns 7 coins ranked by 24h search volume (`score` 0-6, lower = hotter).
  // Convert to our SocialMention shape — ticker = symbol, score = combined trend.
  const top: SocialMention[] = coins.slice(0, 10).map((c, i) => {
    const it = c.item;
    const price24h = it.data?.price_change_percentage_24h?.usd;
    const ticker = (it.symbol ?? "").toUpperCase();
    // Higher rank slot = lower number; flip so first = highest score.
    const slot = it.score ?? i;
    return {
      ticker,
      mentions: 7 - slot, // 7..1, slot 0 → 7 mentions
      score: Math.round(((7 - slot) * 1000) + (price24h ? Math.abs(price24h) * 10 : 0)),
      topPostTitle: `${it.name} trending on CoinGecko${price24h != null ? ` · 24h ${price24h >= 0 ? "+" : ""}${price24h.toFixed(1)}%` : ""}`,
      topPostUrl: `https://www.coingecko.com/en/coins/${it.id}`,
      topPostScore: 7 - slot,
    };
  });

  return {
    top,
    scanned: coins.length,
    sources: {
      ok: coins.length > 0 ? ["coingecko/trending"] : [],
      fail: [],
    },
    path: "coingecko-trending",
    ts: Date.now(),
  };
}

// ── Public entry ──────────────────────────────────────────────────────────

export async function getSocialBuzz(): Promise<SocialBuzzResponse> {
  // Try Reddit OAuth path first if credentials exist.
  try {
    const token = await getRedditToken();
    if (token) {
      const reddit = await getRedditBuzz(token);
      // Only return Reddit if we actually got some data; otherwise fall back.
      if (reddit.top.length > 0 || reddit.sources.ok.length > 0) return reddit;
    }
  } catch (err) {
    // swallow — fall through to CoinGecko
    console.warn("[social] reddit oauth failed:", (err as Error).message);
  }

  return getCoinGeckoTrending();
}
