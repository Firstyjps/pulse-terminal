import { describe, expect, it, vi } from "vitest";
import {
  callOpenAICompat,
  DEEPSEEK_BASE_URL,
  GROQ_BASE_URL,
  OPENAI_BASE_URL,
  OPENROUTER_BASE_URL,
} from "./openai-compat.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("callOpenAICompat — request shape", () => {
  it("POSTs to provided baseUrl with Bearer auth + chat-completions body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { role: "assistant", content: " hi " } }] }),
    );
    const out = await callOpenAICompat(
      { system: "you are a quant", user: "what's up", maxTokens: 50 },
      "sk-test-zzzz",
      "gpt-4o-mini",
      OPENAI_BASE_URL,
      fetchImpl,
      5_000,
    );

    expect(out).toBe("hi"); // trimmed
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer sk-test-zzzz");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.max_tokens).toBe(50);
    expect(body.messages).toEqual([
      { role: "system", content: "you are a quant" },
      { role: "user", content: "what's up" },
    ]);
  });

  it("works against Groq base URL (same shape, different host)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: "groq says hi" } }] }),
    );
    await callOpenAICompat(
      { system: "s", user: "u", maxTokens: 10 },
      "gsk_xxx",
      "llama-3.3-70b-versatile",
      GROQ_BASE_URL,
      fetchImpl,
      5_000,
    );
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("works against OpenRouter base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: "ok" } }] }),
    );
    await callOpenAICompat(
      { system: "s", user: "u", maxTokens: 10 },
      "sk-or-xxx",
      "openai/gpt-4o-mini",
      OPENROUTER_BASE_URL,
      fetchImpl,
      5_000,
    );
    expect(fetchImpl.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("works against DeepSeek base URL with deepseek-chat default model", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: "ds reply" } }] }),
    );
    const out = await callOpenAICompat(
      { system: "you are a quant", user: "?", maxTokens: 30 },
      "sk-deepseek-zzzz",
      "deepseek-chat",
      DEEPSEEK_BASE_URL,
      fetchImpl,
      5_000,
    );
    expect(out).toBe("ds reply");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-deepseek-zzzz");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("deepseek-chat");
  });
});

describe("callOpenAICompat — error paths", () => {
  it("returns null on HTTP non-2xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: { message: "invalid_api_key" } }));
    const out = await callOpenAICompat(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "m",
      OPENAI_BASE_URL,
      fetchImpl,
      5_000,
    );
    expect(out).toBeNull();
  });

  it("returns null on malformed body (no choices)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { weird: "shape" }));
    const out = await callOpenAICompat(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "m",
      OPENAI_BASE_URL,
      fetchImpl,
      5_000,
    );
    expect(out).toBeNull();
  });

  it("returns null on empty content string", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "   " } }] }));
    const out = await callOpenAICompat(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "m",
      OPENAI_BASE_URL,
      fetchImpl,
      5_000,
    );
    expect(out).toBeNull();
  });

  it("returns null when fetch rejects (network error)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const out = await callOpenAICompat(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "m",
      OPENAI_BASE_URL,
      fetchImpl,
      5_000,
    );
    expect(out).toBeNull();
  });

  it("aborts via AbortController when timeout fires", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const out = await callOpenAICompat(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "m",
      OPENAI_BASE_URL,
      fetchImpl,
      30, // 30ms — abort hits before mock resolves
    );
    expect(out).toBeNull();
  });
});
