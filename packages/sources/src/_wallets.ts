// Wallet-address parser for `PULSE_WALLETS` env (comma-separated, mixed-chain).
// EVM = 0x-prefixed 40-hex. Solana = base58 32-44 chars (no 0/O/I/l).
// Adapters call `getEvmWallets()` / `getSolanaWallets()` to filter to the chain
// they support; non-matching addresses are silently skipped.

export type WalletChain = "evm" | "solana";

export interface ParsedWallet {
  address: string;
  chain: WalletChain;
}

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function parseWallets(raw: string | undefined): ParsedWallet[] {
  if (!raw) return [];
  const out: ParsedWallet[] = [];
  for (const piece of raw.split(",")) {
    const addr = piece.trim();
    if (!addr) continue;
    if (EVM_RE.test(addr)) {
      out.push({ address: addr.toLowerCase(), chain: "evm" });
    } else if (SOL_RE.test(addr)) {
      out.push({ address: addr, chain: "solana" });
    }
    // unrecognized format → silently dropped
  }
  return out;
}

export function getEvmWallets(env = process.env.PULSE_WALLETS): string[] {
  return parseWallets(env).filter((w) => w.chain === "evm").map((w) => w.address);
}

export function getSolanaWallets(env = process.env.PULSE_WALLETS): string[] {
  return parseWallets(env).filter((w) => w.chain === "solana").map((w) => w.address);
}
