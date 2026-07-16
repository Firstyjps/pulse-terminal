// Cloudflare blocks farside.co.uk for default curl/Node TLS fingerprints.
// Workaround: shell out to curl-impersonate. Cloudflare rotates which
// fingerprints it challenges (Chrome 116 got blocked 2026-07 while Firefox 117
// still passed), so curlGet probes a list of candidate binaries and uses the
// first one that returns a real table instead of a challenge page. When every
// candidate fails, flow data ends up null and the upstream caller (etf.ts)
// serves its last good scrape — or, with nothing real to serve, the
// synthesized proxy path.
//
// Install on Linux/macOS:
//   mkdir -p ~/bin && cd ~/bin
//   curl -sSL https://github.com/lwthiker/curl-impersonate/releases/download/v0.6.1/curl-impersonate-v0.6.1.x86_64-linux-gnu.tar.gz | tar xz
// Then point at a preferred binary via env: FARSIDE_CURL=$HOME/bin/curl_ff117
//
// This file is **server-only** — re-exported through `@pulse/sources/server`
// only, never the browser-safe `@pulse/sources` barrel.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { ETFFlow } from "./types.js";

const execFileP = promisify(execFile);

// Archive paths — full history (BTC since Jan 2024, ETH since Jul 2024).
// `/btc/` and `/eth/` only return ~14 most-recent rows; the archive pages
// return 590+ / 450+ rows so cumulative is true since-inception.
const URLS = {
  btc: "https://farside.co.uk/bitcoin-etf-flow/",
  eth: "https://farside.co.uk/ethereum-etf/",
};

/** Curl binaries that may pass Cloudflare, in preference order:
 *   1. FARSIDE_CURL env (explicit override)
 *   2. ~/bin/curl_ff117, ~/bin/curl_chrome116 (default install locations)
 *   3. curl-impersonate-ff / curl-impersonate-chrome on PATH
 *   4. plain curl (will likely get challenged, but won't crash) */
function candidateBins(): string[] {
  const bins: string[] = [];
  const fromEnv = process.env.FARSIDE_CURL;
  if (fromEnv && existsSync(fromEnv)) bins.push(fromEnv);
  for (const name of ["bin/curl_ff117", "bin/curl_chrome116"]) {
    const p = resolve(homedir(), name);
    if (existsSync(p)) bins.push(p);
  }
  bins.push("curl-impersonate-ff", "curl-impersonate-chrome", "curl");
  return bins;
}

// No -A / -H overrides here: the curl-impersonate wrappers pin a full header
// set matching their TLS fingerprint, and overriding the UA creates a
// TLS-vs-header mismatch that Cloudflare flags as a bot.
async function curlGet(url: string): Promise<string | null> {
  const args = ["-sSL", "--compressed", "--max-time", "20", url];
  for (const bin of candidateBins()) {
    try {
      const { stdout } = await execFileP(bin, args, { maxBuffer: 16 * 1024 * 1024 });
      // A challenge/block page has no data table — try the next fingerprint.
      if (stdout.includes("tabletext")) return stdout;
    } catch {
      // Binary missing or curl error — try the next candidate.
    }
  }
  return null;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

interface FarsideRow {
  date: string;
  total: number;
}

function parseTable(html: string): FarsideRow[] {
  const rows: FarsideRow[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;

  while ((m = trRegex.exec(html)) !== null) {
    const inner = m[1];
    const dateMatch = inner.match(
      /<span class="tabletext">\s*(\d{1,2})\s+([A-Z][a-z]{2})\s+(\d{4})\s*<\/span>/,
    );
    if (!dateMatch) continue;

    const day = parseInt(dateMatch[1], 10);
    const month = MONTHS[dateMatch[2]];
    const year = parseInt(dateMatch[3], 10);
    if (month === undefined) continue;

    const date = new Date(Date.UTC(year, month, day))
      .toISOString()
      .slice(0, 10);

    const cellRegex =
      /<span class="tabletext">\s*(?:<span class="redFont">\s*\(\s*([\d,]+\.?\d*)\s*\)\s*<\/span>|([\d,]+\.?\d*|-))\s*<\/span>/g;
    const values: number[] = [];
    let c: RegExpExecArray | null;
    while ((c = cellRegex.exec(inner)) !== null) {
      const neg = c[1];
      const pos = c[2];
      if (neg) values.push(-parseFloat(neg.replace(/,/g, "")));
      else if (pos === "-") values.push(0);
      else if (pos !== undefined) values.push(parseFloat(pos.replace(/,/g, "")));
    }

    if (values.length < 3) continue;
    rows.push({ date, total: values[values.length - 1] });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchSide(symbol: "btc" | "eth"): Promise<FarsideRow[] | null> {
  const html = await curlGet(URLS[symbol]);
  if (!html) return null;
  const rows = parseTable(html);
  return rows.length > 5 ? rows : null;
}

export async function fetchFarsideEtf(): Promise<ETFFlow[] | null> {
  const [btc, eth] = await Promise.all([fetchSide("btc"), fetchSide("eth")]);
  if (!btc || !eth) return null;

  const map = new Map<string, ETFFlow>();
  for (const r of btc) {
    map.set(r.date, {
      date: r.date,
      btc: r.total * 1e6,
      eth: 0,
      btcCumulative: 0,
      ethCumulative: 0,
    });
  }
  for (const r of eth) {
    const existing = map.get(r.date);
    if (existing) existing.eth = r.total * 1e6;
    else
      map.set(r.date, {
        date: r.date,
        btc: 0,
        eth: r.total * 1e6,
        btcCumulative: 0,
        ethCumulative: 0,
      });
  }

  const flows = Array.from(map.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  let btcCum = 0;
  let ethCum = 0;
  for (const f of flows) {
    btcCum += f.btc;
    ethCum += f.eth;
    f.btcCumulative = btcCum;
    f.ethCumulative = ethCum;
  }

  return flows;
}
