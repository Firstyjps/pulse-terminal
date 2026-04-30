// Whale alerts — real-time scan of the BTC mempool for large unconfirmed
// transactions. Complements `whale-flow.ts` which reads CONFIRMED transfers
// from block explorers; this one watches the unconfirmed pool so signal
// fires sooner (at broadcast, not at first block confirmation).
//
// Source: https://blockchain.info/unconfirmed-transactions?format=json
// (free, no auth, ~10k tx response that we filter client-side by size).

import { fetchJson } from "./_helpers.js";

export interface WhaleAlertTx {
  /** Transaction hash. */
  hash: string;
  /** Total output value in BTC. */
  amountBtc: number;
  /** Estimated USD value at the BTC price passed into the call. */
  amountUsd: number;
  /** ms epoch when blockchain.info first saw the tx. */
  ts: number;
  /** Number of inputs / outputs. */
  inputs: number;
  outputs: number;
  /** Tx size in bytes (proxy for fee complexity). */
  size: number;
}

export interface WhaleAlertsResponse {
  thresholdUsd: number;
  btcPrice: number;
  /** Sorted by ts desc (newest first). */
  alerts: WhaleAlertTx[];
  /** Total tx scanned in the mempool snapshot. */
  scanned: number;
  ts: number;
}

interface BlockchainTxResp {
  txs?: Array<{
    hash: string;
    time: number;             // unix seconds
    size: number;
    vin_sz?: number;
    vout_sz?: number;
    inputs?: { prev_out?: { value?: number } }[];
    out?: { value: number }[];
  }>;
}

const URL = "https://blockchain.info/unconfirmed-transactions?format=json";

/**
 * Scan the unconfirmed pool and surface tx whose total OUTPUT value exceeds
 * `thresholdUsd`. Caller passes the BTC spot price so this stays a pure
 * signal source (we don't fetch price here — separation of concerns).
 */
export async function getWhaleAlerts(
  thresholdUsd: number,
  btcPrice: number,
): Promise<WhaleAlertsResponse> {
  if (btcPrice <= 0) {
    return {
      thresholdUsd,
      btcPrice,
      alerts: [],
      scanned: 0,
      ts: Date.now(),
    };
  }
  const minBtc = thresholdUsd / btcPrice;
  const json = await fetchJson<BlockchainTxResp>(URL, { revalidate: 30, retries: 1 });
  const txs = json.txs ?? [];

  const alerts: WhaleAlertTx[] = [];
  for (const tx of txs) {
    let totalSats = 0;
    for (const o of tx.out ?? []) totalSats += o.value || 0;
    const amountBtc = totalSats / 1e8;
    if (amountBtc < minBtc) continue;
    alerts.push({
      hash: tx.hash,
      amountBtc: +amountBtc.toFixed(4),
      amountUsd: Math.round(amountBtc * btcPrice),
      ts: (tx.time ?? Date.now() / 1000) * 1000,
      inputs: tx.vin_sz ?? tx.inputs?.length ?? 0,
      outputs: tx.vout_sz ?? tx.out?.length ?? 0,
      size: tx.size ?? 0,
    });
  }
  alerts.sort((a, b) => b.ts - a.ts);

  return {
    thresholdUsd,
    btcPrice,
    alerts: alerts.slice(0, 50),
    scanned: txs.length,
    ts: Date.now(),
  };
}
