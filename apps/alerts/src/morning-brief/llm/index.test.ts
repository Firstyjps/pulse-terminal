import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetLLMLogState, callLLM, resolveLLMConfig } from "./index.js";

// Prevent the legacy-anthropic dispatch test from making a real network call
// — the SDK is mocked to throw synchronously.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropicForIndexTest {
    messages = {
      create: vi.fn().mockRejectedValue(new Error("mocked-no-network")),
    };
  },
}));

// We exercise resolveLLMConfig with explicit env objects to keep these
// hermetic — never touch process.env directly inside assertions.

describe("resolveLLMConfig — provider resolution", () => {
  it("explicit LLM_PROVIDER wins over legacy ANTHROPIC_API_KEY", () => {
    const cfg = resolveLLMConfig({
      LLM_PROVIDER: "groq",
      LLM_API_KEY: "gsk-zzz-abcd",
      ANTHROPIC_API_KEY: "sk-ant-xxxx",
    } as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe("groq");
    expect(cfg.apiKey).toBe("gsk-zzz-abcd");
    expect(cfg.legacyAnthropic).toBe(false);
  });

  it("legacy ANTHROPIC_API_KEY only → provider=anthropic + legacyAnthropic=true", () => {
    const cfg = resolveLLMConfig({
      ANTHROPIC_API_KEY: "sk-ant-xxxx-1234",
    } as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.apiKey).toBe("sk-ant-xxxx-1234");
    expect(cfg.legacyAnthropic).toBe(true);
  });

  it("nothing set → provider=none", () => {
    const cfg = resolveLLMConfig({} as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe("none");
    expect(cfg.apiKey).toBe("");
    expect(cfg.legacyAnthropic).toBe(false);
  });

  it("explicit LLM_PROVIDER=none overrides legacy key", () => {
    const cfg = resolveLLMConfig({
      LLM_PROVIDER: "none",
      ANTHROPIC_API_KEY: "sk-ant-xxxx",
    } as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe("none");
  });

  it("unknown provider name falls back to none", () => {
    const cfg = resolveLLMConfig({
      LLM_PROVIDER: "cohere",
      LLM_API_KEY: "k",
    } as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe("none");
  });

  it("default model picked per provider when LLM_MODEL unset", () => {
    expect(
      resolveLLMConfig({
        LLM_PROVIDER: "anthropic",
        LLM_API_KEY: "k",
      } as NodeJS.ProcessEnv).model,
    ).toBe("claude-haiku-4-5-20251001");

    expect(
      resolveLLMConfig({
        LLM_PROVIDER: "openai",
        LLM_API_KEY: "k",
      } as NodeJS.ProcessEnv).model,
    ).toBe("gpt-4o-mini");

    expect(
      resolveLLMConfig({
        LLM_PROVIDER: "groq",
        LLM_API_KEY: "k",
      } as NodeJS.ProcessEnv).model,
    ).toBe("llama-3.3-70b-versatile");

    expect(
      resolveLLMConfig({
        LLM_PROVIDER: "openrouter",
        LLM_API_KEY: "k",
      } as NodeJS.ProcessEnv).model,
    ).toBe("openai/gpt-4o-mini");

    expect(
      resolveLLMConfig({
        LLM_PROVIDER: "gemini",
        LLM_API_KEY: "k",
      } as NodeJS.ProcessEnv).model,
    ).toBe("gemini-2.5-flash");

    expect(
      resolveLLMConfig({
        LLM_PROVIDER: "deepseek",
        LLM_API_KEY: "k",
      } as NodeJS.ProcessEnv).model,
    ).toBe("deepseek-chat");
  });

  it("LLM_MODEL override beats default", () => {
    const cfg = resolveLLMConfig({
      LLM_PROVIDER: "openai",
      LLM_API_KEY: "k",
      LLM_MODEL: "gpt-5-supreme",
    } as NodeJS.ProcessEnv);
    expect(cfg.model).toBe("gpt-5-supreme");
  });

  it("anthropic accepts LLM_API_KEY when ANTHROPIC_API_KEY missing", () => {
    const cfg = resolveLLMConfig({
      LLM_PROVIDER: "anthropic",
      LLM_API_KEY: "sk-ant-via-llm-key",
    } as NodeJS.ProcessEnv);
    expect(cfg.apiKey).toBe("sk-ant-via-llm-key");
  });

  it("provider name is case-insensitive + trimmed", () => {
    const cfg = resolveLLMConfig({
      LLM_PROVIDER: "  GROQ  ",
      LLM_API_KEY: "k",
    } as NodeJS.ProcessEnv);
    expect(cfg.provider).toBe("groq");
  });
});

describe("callLLM — dispatcher behavior", () => {
  beforeEach(() => _resetLLMLogState());
  afterEach(() => _resetLLMLogState());

  it("returns null when provider=none", async () => {
    const out = await callLLM(
      { system: "s", user: "u", maxTokens: 100 },
      { config: { provider: "none", apiKey: "", model: "", legacyAnthropic: false } },
    );
    expect(out).toBeNull();
  });

  it("returns null + warns when explicit provider has no key", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await callLLM(
      { system: "s", user: "u", maxTokens: 100 },
      {
        config: { provider: "groq", apiKey: "", model: "llama-3.3-70b-versatile", legacyAnthropic: false },
      },
    );
    expect(out).toBeNull();
    expect(spy.mock.calls.flat().some((m) => String(m).includes("no API key"))).toBe(true);
    spy.mockRestore();
  });

  it("logs startup line once per (provider, model, key-tail) combo", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    } as unknown as Response);
    const config = { provider: "openai" as const, apiKey: "sk-1234", model: "gpt-4o-mini", legacyAnthropic: false };

    await callLLM({ system: "s", user: "u", maxTokens: 50 }, { config, fetchImpl });
    await callLLM({ system: "s", user: "u", maxTokens: 50 }, { config, fetchImpl });

    const startupLogs = logSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.startsWith("[llm]"));
    expect(startupLogs.length).toBe(1);
    // key tail only (last 4)
    expect(startupLogs[0]).toContain("key=...1234");
    expect(startupLogs[0]).not.toContain("sk-1234");
    logSpy.mockRestore();
  });

  it("LLM_PROVIDER=deepseek dispatches to openai-compat with the DeepSeek base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    } as unknown as Response);
    const out = await callLLM(
      { system: "s", user: "u", maxTokens: 50 },
      {
        config: { provider: "deepseek", apiKey: "sk-ds-xxxx", model: "deepseek-chat", legacyAnthropic: false },
        fetchImpl,
      },
    );
    expect(out).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.deepseek.com/v1/chat/completions");
  });

  it("legacy anthropic config emits deprecation warn once", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = {
      provider: "anthropic" as const,
      apiKey: "sk-ant-old",
      model: "claude-haiku-4-5-20251001",
      legacyAnthropic: true,
    };
    // Anthropic SDK call will fail due to fake key, but the deprecation warn
    // fires before the SDK is touched.
    await callLLM({ system: "s", user: "u", maxTokens: 10 }, { config });
    const deprecationLines = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes("legacy fallback"));
    expect(deprecationLines.length).toBe(1);
    warnSpy.mockRestore();
  });
});
