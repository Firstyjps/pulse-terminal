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
    );
    expect(out).toBe("hello\nworld"); // trimmed
    expect(messagesCreate).toHaveBeenCalledWith({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      system: "you are a quant",
      messages: [{ role: "user", content: "?" }],
    });
  });

  it("returns null on SDK throw", async () => {
    messagesCreate.mockRejectedValueOnce(new Error("rate_limit"));
    const out = await callAnthropic(
      { system: "s", user: "u", maxTokens: 10 },
      "sk-ant-x",
      "claude-haiku-4-5-20251001",
    );
    expect(out).toBeNull();
  });

  it("returns null when no text blocks present", async () => {
    messagesCreate.mockResolvedValueOnce({ content: [{ type: "tool_use", id: "y" }] });
    const out = await callAnthropic(
      { system: "s", user: "u", maxTokens: 10 },
      "sk-ant-x",
      "claude-haiku-4-5-20251001",
    );
    expect(out).toBeNull();
  });
});
