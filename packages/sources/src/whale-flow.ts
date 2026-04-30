// On-chain whale flow — self-index from public block explorers.
// Free / no auth (Etherscan free tier 5 req/sec, Mempool.space unlimited public,
// TronScan public API 5 req/sec).
//
// Strategy:
//   1. Etherscan: poll latest 100 ERC-20 transfers for known stablecoins (USDT/USDC).
//   2. Mempool.space: scan recent BTC blocks for outputs above threshold.
//   3. TronScan: latest TRC-20 USDT transfers (Tron is the largest USDT supply ~$60B+).
//   4. Resolve from/to against a hardcoded exchange address book → label as
//      "BINANCE", "COINBASE", "KRAKEN", etc. Unknown addrs → "UNKNOWN".
//
// The threshold is per-asset (BTC > 100, ETH > 1000, USDT/USDC > 5_000_000)
// because contracts vs native have wildly different "whale" scales.
//
// ETHERSCAN_API_KEY (optional) bumps rate limit from 1 → 5 req/sec.

import { fetchJson } from "./_helpers.js";

export interface WhaleTransfer {
  chain: "btc" | "eth" | "tron";
  asset: string;          // BTC / ETH / USDT / USDC
  amount: number;         // human-readable (BTC, ETH, or token units)
  amountUsd: number;
  from: string;           // address
  to: string;
  fromLabel: string;      // exchange/entity label or "UNKNOWN"
  toLabel: string;
  direction: "IN" | "OUT" | "INTERNAL"; // relative to known exchanges
  txHash: string;
  ts: number;             // ms epoch
}

export interface WhaleFlowResponse {
  transfers: WhaleTransfer[];
  ts: number;
  sources: { ok: string[]; fail: string[] };
}

// Curated exchange address book (lowercase). Subset of the well-known cluster.
// Expand over time; coverage gaps fall through to "UNKNOWN".
const ETH_EXCHANGES: Record<string, string> = {
  // Binance
  "0x28c6c06298d514db089934071355e5743bf21d60": "BINANCE",
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "BINANCE",
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": "BINANCE",
  "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": "BINANCE",
  "0x9696f59e4d72e237be84ffd425dcad154bf96976": "BINANCE",
  "0x4976a4a02f38326660d17bf34b431dc6e2eb2327": "BINANCE",
  "0xd551234ae421e3bcba99a0da6d736074f22192ff": "BINANCE",
  // Coinbase
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": "COINBASE",
  "0x503828976d22510aad0201ac7ec88293211d23da": "COINBASE",
  "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740": "COINBASE",
  "0x3cd751e6b0078be393132286c442345e5dc49699": "COINBASE",
  "0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511": "COINBASE",
  // Kraken
  "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": "KRAKEN",
  "0xa910f92acdaf488fa6ef02174fb86208ad7722ba": "KRAKEN",
  "0xe853c56864a2ebe4576a807d26fdc4a0ada51919": "KRAKEN",
  // OKX
  "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": "OKX",
  "0x6fb624b48d9299674022a23d92515e76ba880113": "OKX",
  // Bybit (known hot wallet)
  "0xf89d7b9c864f589bbf53a82105107622b35eaa40": "BYBIT",
  // Tether Treasury
  "0x5754284f345afc66a98fbb0a0afe71e0f007b949": "TETHER_TREASURY",
};

// Known token contracts on ETH (USDT, USDC, etc.)
const ETH_TOKEN_CONTRACTS = {
  USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
};

// Tron USDT (TRC-20). Tron is the largest USDT supply (~$60B+).
const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

// Curated TRX exchange address book (base58, T-prefix). Coverage gaps fall
// through to "UNKNOWN". Maintained in human-readable form here, then converted
// to hex at module init for matching against TronGrid event payloads (which
// return raw hex addresses).
const TRON_EXCHANGES: Record<string, string> = {
  // Binance hot wallets
  "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb": "BINANCE",
  "TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs": "BINANCE",
  "TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9": "BINANCE",
  "TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G": "BINANCE",
  // OKX
  "TKzxdSv2FZKQrEqkKVgp5DcwEXBEKMg2Ax": "OKX",
  "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7": "OKX",
  "TFVqiD4SXvLY3M6mxe7BfZ6pFJgHr1xQAR": "OKX",
  // HTX (Huobi)
  "THPvaUhoh2Qn2y9THCZML3H815hhFhn5YC": "HTX",
  "TEDdnAa4QDWB8FcyFjnfPJBSk9LmXZupJM": "HTX",
  // KuCoin
  "TAkv2vjqBnyCsELnZ55zNS3GehywnvD9NY": "KUCOIN",
  "TWvzcN5RxiAY8KRJUsGbpjPnDGHXRwgfyL": "KUCOIN",
  // Bybit
  "TM1zzNDZD2DPASbKcgdVoTYhfmYgtfwx9R": "BYBIT",
  // Bitfinex
  "TYDzsYUEpvnYmQk4zGP9sWWcTEd2MiAtW6": "BITFINEX",
};

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decode base58 (no checksum verify) → bytes. Tron addrs are 25 bytes. */
function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58_ALPHABET.indexOf(c);
    if (i < 0) throw new Error(`invalid base58 char: ${c}`);
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

/** Tron base58check addr → 0x-prefixed 20-byte hex (lowercase). */
function tronBase58ToHex(addr: string): string {
  const bytes = b58decode(addr);
  // Tron base58check = [0x41, ...20 bytes..., 4-byte checksum]
  if (bytes.length !== 25) throw new Error(`bad tron addr len ${bytes.length}: ${addr}`);
  if (bytes[0] !== 0x41) throw new Error(`bad tron prefix 0x${bytes[0].toString(16)}: ${addr}`);
  const hex = Array.from(bytes.slice(1, 21))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "0x" + hex;
}

// Build a hex→label map at module init so TronGrid events can be labeled
// without per-tx base58 encoding. Skip malformed entries silently.
const TRON_EXCHANGES_HEX: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [b58, label] of Object.entries(TRON_EXCHANGES)) {
    try {
      out[tronBase58ToHex(b58).toLowerCase()] = label;
    } catch {
      // ignore malformed entries
    }
  }
  return out;
})();

function labelTronHex(hexAddr: string): string {
  return TRON_EXCHANGES_HEX[hexAddr.toLowerCase()] ?? "UNKNOWN";
}

// Whale thresholds — minimum size to surface
const THRESHOLD_USD = Number(process.env.WHALE_FLOW_MIN_USD ?? 10_000_000);

const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY ?? "";

function labelEth(addr: string): string {
  return ETH_EXCHANGES[addr.toLowerCase()] ?? "UNKNOWN";
}

function classifyDirection(fromLabel: string, toLabel: string): "IN" | "OUT" | "INTERNAL" {
  const fromKnown = fromLabel !== "UNKNOWN";
  const toKnown = toLabel !== "UNKNOWN";
  if (fromKnown && toKnown) return "INTERNAL";
  if (toKnown) return "IN";   // money flowing INTO an exchange
  if (fromKnown) return "OUT"; // money flowing OUT of an exchange
  return "INTERNAL";
}

// ── Ethereum (ERC-20 + native) ──────────────────────────────────────────────
interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenDecimal?: string;
  tokenSymbol?: string;
  contractAddress?: string;
  timeStamp: string;
}
interface EtherscanResp { status: string; result: EtherscanTx[] | string }

async function ethTokenTransfers(contract: string, symbol: "USDT" | "USDC"): Promise<WhaleTransfer[]> {
  const key = ETHERSCAN_KEY ? `&apikey=${ETHERSCAN_KEY}` : "";
  const url =
    `https://api.etherscan.io/api?module=account&action=tokentx` +
    `&contractaddress=${contract}` +
    `&page=1&offset=100&sort=desc${key}`;
  const json = await fetchJson<EtherscanResp>(url, { revalidate: 30, retries: 1 });
  if (typeof json.result === "string" || !Array.isArray(json.result)) return [];

  // Stablecoins ≈ $1, so amount in USD ≈ amount in token units.
  const out: WhaleTransfer[] = [];
  for (const tx of json.result) {
    const decimals = parseInt(tx.tokenDecimal ?? "6", 10);
    const amount = parseFloat(tx.value) / 10 ** decimals;
    if (amount < THRESHOLD_USD) continue;
    const fromLabel = labelEth(tx.from);
    const toLabel = labelEth(tx.to);
    out.push({
      chain: "eth",
      asset: symbol,
      amount,
      amountUsd: amount,
      from: tx.from,
      to: tx.to,
      fromLabel,
      toLabel,
      direction: classifyDirection(fromLabel, toLabel),
      txHash: tx.hash,
      ts: parseInt(tx.timeStamp, 10) * 1000,
    });
  }
  return out;
}

// ── Tron USDT (TronGrid official) ───────────────────────────────────────────
// TronScan was unstable on Hetzner (HTTP 200 with empty body when rate-
// limited). TronGrid is the official public node — addresses come back as
// hex (0x-prefixed) so we match against TRON_EXCHANGES_HEX.
//
// TRON_API_KEY (optional) bumps the free tier rate limit.
interface TronGridEvent {
  block_timestamp: number;       // ms epoch
  transaction_id: string;
  result: {
    from: string;                // 0x-prefixed hex
    to: string;
    value: string;               // raw amount, USDT = 6 decimals
  };
}
interface TronGridResp { data?: TronGridEvent[]; success?: boolean }

async function tronUsdtTransfers(): Promise<WhaleTransfer[]> {
  const url =
    `https://api.trongrid.io/v1/contracts/${TRON_USDT_CONTRACT}/events` +
    `?event_name=Transfer&order_by=block_timestamp,desc&limit=100`;
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (process.env.TRON_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRON_API_KEY;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`trongrid HTTP ${res.status}`);
  const json = (await res.json()) as TronGridResp;
  if (!json.data?.length) return [];

  const out: WhaleTransfer[] = [];
  for (const evt of json.data) {
    if (!evt.result?.value) continue;
    const amount = parseFloat(evt.result.value) / 1e6; // USDT-TRC20 = 6 decimals
    if (amount < THRESHOLD_USD) continue;
    const fromLabel = labelTronHex(evt.result.from);
    const toLabel = labelTronHex(evt.result.to);
    out.push({
      chain: "tron",
      asset: "USDT",
      amount,
      amountUsd: amount,           // stablecoin ≈ $1
      from: evt.result.from,
      to: evt.result.to,
      fromLabel,
      toLabel,
      direction: classifyDirection(fromLabel, toLabel),
      txHash: evt.transaction_id,
      ts: evt.block_timestamp,
    });
  }
  return out;
}

// ── Bitcoin (Mempool.space) ─────────────────────────────────────────────────
interface MempoolTx {
  txid: string;
  vin: { prevout?: { scriptpubkey_address?: string; value?: number } }[];
  vout: { scriptpubkey_address?: string; value: number }[];
  status: { block_time?: number };
}

async function btcWhales(btcUsd: number): Promise<WhaleTransfer[]> {
  // Mempool.space's /blocks/tip/hash returns plain text (the hash), not JSON.
  // Fetch raw text first, then JSON for the txs list.
  const tipRes = await fetch("https://mempool.space/api/blocks/tip/hash", { cache: "no-store" });
  if (!tipRes.ok) throw new Error(`mempool.space tip-hash HTTP ${tipRes.status}`);
  const tipHash = (await tipRes.text()).trim();
  const txs = await fetchJson<MempoolTx[]>(
    `https://mempool.space/api/block/${tipHash}/txs`,
    { revalidate: 60, retries: 1 },
  );

  const minBtc = THRESHOLD_USD / Math.max(btcUsd, 1);
  const out: WhaleTransfer[] = [];

  for (const tx of txs) {
    let totalSats = 0;
    for (const v of tx.vout) totalSats += v.value || 0;
    const totalBtc = totalSats / 1e8;
    if (totalBtc < minBtc) continue;

    const fromAddr = tx.vin[0]?.prevout?.scriptpubkey_address ?? "";
    const toAddr = tx.vout.find((v) => v.value === Math.max(...tx.vout.map((x) => x.value)))?.scriptpubkey_address ?? "";

    out.push({
      chain: "btc",
      asset: "BTC",
      amount: totalBtc,
      amountUsd: totalBtc * btcUsd,
      from: fromAddr,
      to: toAddr,
      fromLabel: "UNKNOWN", // BTC labels not implemented yet
      toLabel: "UNKNOWN",
      direction: "INTERNAL",
      txHash: tx.txid,
      ts: (tx.status.block_time ?? Date.now() / 1000) * 1000,
    });
  }
  return out.slice(0, 20);
}

// ── BTC price helper ────────────────────────────────────────────────────────
interface CGPriceResp { bitcoin?: { usd?: number } }

async function getBtcUsd(): Promise<number> {
  try {
    const j = await fetchJson<CGPriceResp>(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { revalidate: 300, retries: 1 },
    );
    return j.bitcoin?.usd ?? 70_000;
  } catch {
    return 70_000; // sane fallback
  }
}

// ── Public entry ────────────────────────────────────────────────────────────
export async function getWhaleFlow(): Promise<WhaleFlowResponse> {
  const btcUsd = await getBtcUsd();
  const ok: string[] = [];
  const fail: string[] = [];

  const results = await Promise.allSettled([
    ethTokenTransfers(ETH_TOKEN_CONTRACTS.USDT, "USDT").then((r) => { ok.push("etherscan/USDT"); return r; }).catch((e) => { fail.push(`etherscan/USDT: ${(e as Error).message}`); return [] as WhaleTransfer[]; }),
    ethTokenTransfers(ETH_TOKEN_CONTRACTS.USDC, "USDC").then((r) => { ok.push("etherscan/USDC"); return r; }).catch((e) => { fail.push(`etherscan/USDC: ${(e as Error).message}`); return [] as WhaleTransfer[]; }),
    btcWhales(btcUsd).then((r) => { ok.push("mempool.space"); return r; }).catch((e) => { fail.push(`mempool.space: ${(e as Error).message}`); return [] as WhaleTransfer[]; }),
    tronUsdtTransfers().then((r) => { ok.push("tronscan/USDT"); return r; }).catch((e) => { fail.push(`tronscan/USDT: ${(e as Error).message}`); return [] as WhaleTransfer[]; }),
  ]);

  const transfers = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // Sort by ts desc + cap to 50
  transfers.sort((a, b) => b.ts - a.ts);

  return {
    transfers: transfers.slice(0, 50),
    ts: Date.now(),
    sources: { ok, fail },
  };
}
