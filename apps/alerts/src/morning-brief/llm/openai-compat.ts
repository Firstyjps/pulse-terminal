// OpenAI-compatible adapter — covers OpenAI, Groq, and OpenRouter.
// All three accept the same chat-completions wire shape; only base URL differs.

import type { LLMCallParams } from "./types.js";

export const OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenAIChoiceMessage {
  role: string;
  content?: string | null;
}

interface OpenAIResponse {
  choices?: Array<{ message?: OpenAIChoiceMessage }>;
  error?: { message?: string };
}

export async function callOpenAICompat(
  params: LLMCallParams,
  apiKey: string,
  model: string,
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number,
): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetchImpl(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        max_tokens: params.maxTokens,
        temperature: 0.5,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as OpenAIResponse | null;
      console.warn(
        `[llm] openai-compat ${baseUrl} HTTP ${res.status}: ${errBody?.error?.message ?? "unknown"}`,
      );
      return null;
    }

    const body = (await res.json().catch(() => null)) as OpenAIResponse | null;
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return null;
    return text.trim();
  } catch (err) {
    console.warn(`[llm] openai-compat ${baseUrl} threw:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}
