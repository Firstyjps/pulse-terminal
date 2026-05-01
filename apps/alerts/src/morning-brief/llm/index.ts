// Public LLM dispatcher — env-driven, returns null on any failure so callers
// can route to rules-based fallback without try/catch.
//
// Env contract:
//   LLM_PROVIDER  = anthropic | openai | groq | openrouter | gemini | none
//   LLM_MODEL     = provider-specific (default per provider when unset)
//   LLM_API_KEY   = the actual key (never logged in full)
//   LLM_TIMEOUT_MS = default 15000
//
// Backward compat: when LLM_PROVIDER is unset but ANTHROPIC_API_KEY is set,
// we behave as before (provider=anthropic). Logged once as a deprecation warn.

import { callAnthropic } from "./anthropic.js";
import { callGemini } from "./gemini.js";
import {
  callOpenAICompat,
  GROQ_BASE_URL,
  OPENAI_BASE_URL,
  OPENROUTER_BASE_URL,
} from "./openai-compat.js";
import type { LLMCallParams, LLMConfig, LLMProvider } from "./types.js";

const DEFAULT_TIMEOUT_MS = 15_000;

const DEFAULT_MODELS: Record<Exclude<LLMProvider, "none">, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  openrouter: "openai/gpt-4o-mini",
  gemini: "gemini-2.5-flash",
};

const VALID_PROVIDERS: LLMProvider[] = [
  "none",
  "anthropic",
  "openai",
  "groq",
  "openrouter",
  "gemini",
];

// Deduped log lines — each unique message fires once per process. Tests use
// `_resetLLMLogState()` to clear between cases.
const logged = new Set<string>();

function logOnce(level: "log" | "warn", msg: string): void {
  if (logged.has(msg)) return;
  logged.add(msg);
  if (level === "warn") console.warn(msg);
  else console.log(msg);
}

export function _resetLLMLogState(): void {
  logged.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// Config resolution
// ─────────────────────────────────────────────────────────────────────────

export function resolveLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMConfig {
  const explicit = env.LLM_PROVIDER?.toLowerCase().trim();
  const legacyAnthropic = !explicit && !!env.ANTHROPIC_API_KEY;

  let provider: LLMProvider;
  if (explicit) {
    provider = (VALID_PROVIDERS as string[]).includes(explicit)
      ? (explicit as LLMProvider)
      : "none";
    if (provider === "none" && explicit !== "none") {
      logOnce("warn", `[llm] unknown LLM_PROVIDER="${explicit}" — falling back to none (rules only)`);
    }
  } else if (legacyAnthropic) {
    provider = "anthropic";
  } else {
    provider = "none";
  }

  let apiKey = "";
  if (provider === "anthropic") {
    apiKey = env.ANTHROPIC_API_KEY ?? env.LLM_API_KEY ?? "";
  } else if (provider !== "none") {
    apiKey = env.LLM_API_KEY ?? "";
  }

  const model =
    provider === "none"
      ? ""
      : env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider];

  return { provider, apiKey, model, legacyAnthropic };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entrypoint
// ─────────────────────────────────────────────────────────────────────────

export interface CallLLMOpts {
  /** Test seam: override fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam: pass a pre-resolved config (skips env reads). */
  config?: LLMConfig;
}

/**
 * Run a single completion against the env-configured provider. Returns trimmed
 * response text on success, null on any failure (no provider, missing key,
 * HTTP error, malformed body, timeout, …). Callers should treat null as
 * "use fallback path".
 */
export async function callLLM(
  params: LLMCallParams,
  opts: CallLLMOpts = {},
): Promise<string | null> {
  const config = opts.config ?? resolveLLMConfig();
  const timeoutMs =
    params.timeoutMs ?? (Number(process.env.LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);

  // Startup log — fires once per (provider, model, key-suffix) tuple.
  const keyTail = config.apiKey ? `...${config.apiKey.slice(-4)}` : "(none)";
  if (config.provider === "none") {
    logOnce("log", `[llm] provider=none — action candidates use rules fallback`);
  } else {
    logOnce(
      "log",
      `[llm] provider=${config.provider} model=${config.model} key=${keyTail}`,
    );
  }

  if (config.legacyAnthropic) {
    logOnce(
      "warn",
      `[llm] using ANTHROPIC_API_KEY as legacy fallback — set LLM_PROVIDER=anthropic + LLM_API_KEY to silence`,
    );
  }

  if (config.provider === "none") return null;

  if (!config.apiKey) {
    logOnce(
      "warn",
      `[llm] provider=${config.provider} but no API key — falling back to rules`,
    );
    return null;
  }

  switch (config.provider) {
    case "anthropic":
      return callAnthropic(params, config.apiKey, config.model);
    case "openai":
      return callOpenAICompat(params, config.apiKey, config.model, OPENAI_BASE_URL, opts.fetchImpl, timeoutMs);
    case "groq":
      return callOpenAICompat(params, config.apiKey, config.model, GROQ_BASE_URL, opts.fetchImpl, timeoutMs);
    case "openrouter":
      return callOpenAICompat(params, config.apiKey, config.model, OPENROUTER_BASE_URL, opts.fetchImpl, timeoutMs);
    case "gemini":
      return callGemini(params, config.apiKey, config.model, opts.fetchImpl, timeoutMs);
  }
}

export type { LLMConfig, LLMProvider, LLMCallParams } from "./types.js";
