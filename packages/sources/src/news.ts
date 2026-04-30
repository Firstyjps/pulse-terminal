// Crypto news feed — CryptoPanic public API (no key required for ?public=true).
//
// `filter` maps to CryptoPanic's `filter=` query param (rising/hot/bullish/
// bearish/important/saved/lol). "all" omits the filter for the full firehose.
// "BTC"/"ETH" map to currency codes via the `currencies=` param.

import { fetchJson } from "./_helpers.js";

export type NewsFilter = "all" | "BTC" | "ETH" | "hot" | "bullish" | "bearish";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number; // ms epoch
  /** Coin ticker tags (BTC/ETH/SOL…) extracted from CryptoPanic currencies array. */
  tickers: string[];
  /** Sentiment vote summary if CryptoPanic provided one. */
  vote?: {
    positive: number;
    negative: number;
    important: number;
  };
  kind: "news" | "media";
}

interface CPPost {
  id: number;
  kind: "news" | "media";
  title: string;
  published_at: string;          // ISO 8601
  url?: string;
  source?: { title?: string; domain?: string };
  currencies?: { code?: string; title?: string }[];
  votes?: {
    positive?: number;
    negative?: number;
    important?: number;
  };
}
interface CPResp {
  results?: CPPost[];
  count?: number;
}

const BASE = "https://cryptopanic.com/api/v1/posts/";

export async function getCryptoNews(filter: NewsFilter = "all"): Promise<NewsItem[]> {
  const params = new URLSearchParams({ public: "true" });
  if (filter === "BTC" || filter === "ETH") {
    params.set("currencies", filter);
  } else if (filter === "hot" || filter === "bullish" || filter === "bearish") {
    params.set("filter", filter);
  }
  const url = `${BASE}?${params.toString()}`;
  const json = await fetchJson<CPResp>(url, { revalidate: 300, retries: 1 });
  if (!json.results?.length) return [];

  return json.results.slice(0, 30).map((p) => ({
    id: String(p.id),
    title: p.title,
    url: p.url ?? `https://cryptopanic.com/news/${p.id}/`,
    source: p.source?.title ?? p.source?.domain ?? "Unknown",
    publishedAt: Date.parse(p.published_at),
    tickers: (p.currencies ?? []).map((c) => (c.code ?? "").toUpperCase()).filter(Boolean),
    vote: p.votes
      ? {
          positive: p.votes.positive ?? 0,
          negative: p.votes.negative ?? 0,
          important: p.votes.important ?? 0,
        }
      : undefined,
    kind: p.kind,
  }));
}
