import { describe, expect, it } from "vitest";
import { parseWallets, getEvmWallets, getSolanaWallets } from "./_wallets.js";

const EVM_A = "0x1234567890abcdef1234567890abcdef12345678";
const EVM_B_MIXED = "0xABCDEF1234567890abcdef1234567890ABCDEF12";
const SOL_A = "So11111111111111111111111111111111111111112"; // wrapped SOL mint, 43 chars base58
const SOL_B = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

describe("parseWallets", () => {
  it("returns [] for empty / undefined", () => {
    expect(parseWallets(undefined)).toEqual([]);
    expect(parseWallets("")).toEqual([]);
    expect(parseWallets(",,,")).toEqual([]);
  });

  it("classifies a valid EVM address and lowercases it", () => {
    expect(parseWallets(EVM_B_MIXED)).toEqual([
      { address: EVM_B_MIXED.toLowerCase(), chain: "evm" },
    ]);
  });

  it("classifies a valid Solana address (preserves case — base58 is case-sensitive)", () => {
    expect(parseWallets(SOL_A)).toEqual([{ address: SOL_A, chain: "solana" }]);
  });

  it("trims whitespace around each address", () => {
    expect(parseWallets(`  ${EVM_A} ,  ${SOL_A}  `)).toEqual([
      { address: EVM_A, chain: "evm" },
      { address: SOL_A, chain: "solana" },
    ]);
  });

  it("drops unrecognized formats silently", () => {
    expect(parseWallets("not-a-wallet,0xtooshort,0xZZZZ" + "Z".repeat(38))).toEqual([]);
  });

  it("preserves order across mixed chains", () => {
    const parsed = parseWallets(`${SOL_A},${EVM_A},${SOL_B}`);
    expect(parsed.map((w) => w.chain)).toEqual(["solana", "evm", "solana"]);
  });
});

describe("getEvmWallets / getSolanaWallets", () => {
  it("filters to EVM only", () => {
    expect(getEvmWallets(`${EVM_A},${SOL_A}`)).toEqual([EVM_A]);
  });

  it("filters to Solana only", () => {
    expect(getSolanaWallets(`${EVM_A},${SOL_A},${SOL_B}`)).toEqual([SOL_A, SOL_B]);
  });

  it("returns [] when env is undefined", () => {
    expect(getEvmWallets(undefined)).toEqual([]);
    expect(getSolanaWallets(undefined)).toEqual([]);
  });

  it("reads process.env.PULSE_WALLETS by default", () => {
    process.env.PULSE_WALLETS = `${EVM_A},${SOL_A}`;
    try {
      expect(getEvmWallets()).toEqual([EVM_A]);
      expect(getSolanaWallets()).toEqual([SOL_A]);
    } finally {
      delete process.env.PULSE_WALLETS;
    }
  });
});
