// Google Gemini adapter — different request/response shape from OpenAI-compat.
// Uses v1beta:generateContent endpoint with API key as query param.

import type { LLMCallParams } from "./types.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message?: string };
}

export async function callGemini(
  params: LLMCallParams,
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number,
): Promise<string | null> {
  const url = `${BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.system }] },
        contents: [{ role: "user", parts: [{ text: params.user }] }],
        generationConfig: {
          maxOutputTokens: params.maxTokens,
          temperature: 0.5,
        },
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as GeminiResponse | null;
      console.warn(
        `[llm] gemini HTTP ${res.status}: ${errBody?.error?.message ?? "unknown"}`,
      );
      return null;
    }

    const body = (await res.json().catch(() => null)) as GeminiResponse | null;
    const text = body?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) return null;
    return text;
  } catch (err) {
    console.warn(`[llm] gemini threw:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}
