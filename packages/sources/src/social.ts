// Social buzz — Reddit hot posts across crypto subs, ticker mentions ranked
// by engagement score (upvotes × log(comments+1)). Free, no auth.
//
// Reddit's public JSON endpoints sometimes 403 from datacenter IPs. We pass
// a desktop-style User-Agent so it looks like a legit client.

import { fetchJson } from "./_helpers.js";

export interface SocialMention {
  ticker: string;
  /** Times the ticker appeared across hot posts (title + flair). */
  mentions: number;
  /** Aggregate engagement score: sum of upvotes × log(comments+1) across posts. */
  score: number;
  /** Best-engagement post title (truncated 60 chars by route). */
  topPostTitle: string;
  topPostUrl: string;
  topPostScore: number;
}

export interface SocialBuzzResponse {
  /** Top-N tickers ranked by score, descending. */
  top: SocialMention[];
  /** Total posts scanned. */
  scanned: number;
  /** Subs that returned successfully + those that failed (visibility for the UI). */
  sources: { ok: string[]; fail: string[] };
  ts: number;
}

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

const SUBS: { name: string; limit: number }[] = [
  { name: "CryptoCurrency", limit: 25 },
  { name: "Bitcoin",        limit: 15 },
  { name: "ethfinance",     limit: 15 },
];

const UA = "Mozilla/5.0 (Pulse Terminal; +https://cryptopulse.buzz)";

// Tickers we'll match against post titles. Conservative list — common
// false-positive words (e.g. "ANY", "ON") are excluded by min length 3 +
// uppercase-only check + manual blacklist.
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

async function fetchSubHot(sub: string, limit: number): Promise<RedditChild[]> {
  const tryUrls = [
    `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(
      `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`,
    )}`,
  ];
  for (let i = 0; i < tryUrls.length; i++) {
    try {
      const res = await fetch(tryUrls[i], {
        headers: { "User-Agent": UA, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      let json: RedditListing;
      if (i === 0) {
        json = (await res.json()) as RedditListing;
      } else {
        // allorigins wraps the response in `{ contents, status }`
        const wrapped = (await res.json()) as { contents?: string };
        if (!wrapped.contents) continue;
        json = JSON.parse(wrapped.contents) as RedditListing;
      }
      return json.data?.children ?? [];
    } catch {
      // try next
    }
  }
  throw new Error(`reddit/${sub}: all paths failed`);
}

interface Bucket {
  ticker: string;
  mentions: number;
  score: number;
  topPostTitle: string;
  topPostUrl: string;
  topPostScore: number;
}

export async function getSocialBuzz(): Promise<SocialBuzzResponse> {
  const ok: string[] = [];
  const fail: string[] = [];
  const all: RedditChild[] = [];

  const settled = await Promise.allSettled(
    SUBS.map((s) => fetchSubHot(s.name, s.limit)),
  );
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
    // Engagement: upvotes weighted by comment activity.
    const engagement = upvotes * Math.log(comments + 1);
    if (engagement <= 0) continue;

    const seen = new Set<string>();
    const haystack = `${title} ${flair}`;
    for (const m of haystack.matchAll(TICKER_RX)) {
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

  return { top, scanned: all.length, sources: { ok, fail }, ts: Date.now() };
}
