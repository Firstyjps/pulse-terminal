// Shared types for the LLM provider abstraction.
// See ./index.ts for the public callLLM() entrypoint.

export type LLMProvider =
  | "none"
  | "anthropic"
  | "openai"
  | "groq"
  | "openrouter"
  | "gemini"
  | "deepseek";

export interface LLMConfig {
  provider: LLMProvider;
  /** Empty string when provider === "none". */
  apiKey: string;
  model: string;
  /** Set when env was resolved via legacy ANTHROPIC_API_KEY (no LLM_PROVIDER). */
  legacyAnthropic: boolean;
}

export interface LLMCallParams {
  system: string;
  user: string;
  /** Hard ceiling on output tokens. Provider-specific field name handled per adapter. */
  maxTokens: number;
  /** Override timeout for this call. Default LLM_TIMEOUT_MS env or 15s. */
  timeoutMs?: number;
}

/** Provider-specific fetcher signature. Returns text on success, null on any failure. */
export type LLMFetcher = (
  params: LLMCallParams,
  apiKey: string,
  model: string,
  fetchImpl?: typeof fetch,
) => Promise<string | null>;
