import { describe, expect, it, vi } from "vitest";
import { callAnthropic } from "./anthropic.js";

// Anthropic SDK is mocked at the import boundary so the test never opens a
// real socket. We mock the package shape: `new Anthropic({apiKey}).messages.create(...)`
const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class FakeAnthropic {
      messages = { create: messagesCreate };
      constructor(public opts: { apiKey: string }) {}
    },
  };
});

describe("callAnthropic", () => {
  it("returns concatenated text content blocks, trimmed", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: "  hello" },
        { type: "text", text: "world  " },
        { type: "tool_use", id: "x" }, // ignored
      ],
    });
    const out = await callAnthropic(
      { system: "you are a quant", user: "?", maxTokens: 50 },
      "sk-ant-zzzz-1234",
      "claude-haiku-4-5-20251001",
      5_000,
    );
    expect(out).toBe("hello\nworld"); // trimmed
    const [body, opts] = messagesCreate.mock.calls[0];
    expect(body).toEqual({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      system: "you are a quant",
      messages: [{ role: "user", content: "?" }],
    });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns null on SDK throw", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("rate_limit"));
    const out = await callAnthropic(
      { system: "s", user: "u", maxTokens: 10 },
      "sk-ant-x",
      "claude-haiku-4-5-20251001",
      5_000,
    );
    expect(out).toBeNull();
  });

  it("returns null when no text blocks present", async () => {
    messagesCreate.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "y" }] });
    const out = await callAnthropic(
      { system: "s", user: "u", maxTokens: 10 },
      "sk-ant-x",
      "claude-haiku-4-5-20251001",
      5_000,
    );
    expect(out).toBeNull();
  });

  it("aborts via AbortController when upstream stalls past timeoutMs", async () => {
    // Mock SDK to never resolve — only rejects when its signal aborts. Mirrors
    // a stuck Anthropic socket: without our timeout the call would hang for
    // up to 30 minutes (SDK default 600s × maxRetries=2).
    messagesCreate.mockImplementationOnce(
      (_body: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const start = Date.now();
    const out = await callAnthropic(
      { system: "s", user: "u", maxTokens: 10 },
      "sk-ant-x",
      "claude-haiku-4-5-20251001",
      30, // 30ms — abort fires well before any real call could complete
    );
    const elapsed = Date.now() - start;

    expect(out).toBeNull();
    // Should resolve close to 30ms; allow generous slack for CI jitter but
    // assert it's nowhere near the SDK's 600s default.
    expect(elapsed).toBeLessThan(2_000);
  });
});
