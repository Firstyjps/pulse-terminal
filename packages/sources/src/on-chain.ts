// Bitcoin on-chain metrics — blockchain.info public q endpoints + chart API.
// Free, no auth. Each value is a Promise.allSettled fan-out so one slow
// endpoint doesn't block the rest.

export interface OnChainMetrics {
  /** Network hashrate in EH/s (exahash per second). blockchain.info returns GH/s. */
  hashrateEhs: number | null;
  /** Network difficulty in trillions (T). */
  difficultyT: number | null;
  /** Unconfirmed transaction count in the mempool. */
  mempoolCount: number | null;
  /** Latest block height. */
  blockHeight: number | null;
  /** Unique active addresses on the latest 1-day chart bin. */
  activeAddresses: number | null;
  ts: number;
}

const Q = "https://api.blockchain.info/q";
const CHART = "https://api.blockchain.info/charts";

interface ChartResp {
  values?: { x: number; y: number }[];
}

async function fetchTextNum(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const txt = (await res.text()).trim();
    const n = Number(txt);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function fetchChartLast(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as ChartResp;
    const last = json.values?.[json.values.length - 1];
    return last && Number.isFinite(last.y) ? last.y : null;
  } catch {
    return null;
  }
}

export async function getOnChainMetrics(): Promise<OnChainMetrics> {
  const [hashrateGhs, difficulty, mempool, height, addrs] = await Promise.all([
    fetchTextNum(`${Q}/hashrate`),
    fetchTextNum(`${Q}/getdifficulty`),
    fetchTextNum(`${Q}/unconfirmedcount`),
    fetchTextNum(`${Q}/getblockcount`),
    fetchChartLast(`${CHART}/n-unique-addresses?timespan=1days&format=json`),
  ]);

  return {
    // blockchain.info /q/hashrate is in GH/s. Convert to EH/s (× 1e-9).
    hashrateEhs: hashrateGhs != null ? +(hashrateGhs / 1e9).toFixed(2) : null,
    // Difficulty in T (trillions).
    difficultyT: difficulty != null ? +(difficulty / 1e12).toFixed(2) : null,
    mempoolCount: mempool,
    blockHeight: height,
    activeAddresses: addrs != null ? Math.round(addrs) : null,
    ts: Date.now(),
  };
}
