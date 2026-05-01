import { describe, expect, it, vi } from "vitest";
import { callGemini } from "./gemini.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("callGemini — request shape", () => {
  it("POSTs to v1beta:generateContent with key in query string + Gemini body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: "  hi from gemini  " }] } }],
      }),
    );
    const out = await callGemini(
      { system: "you are a quant", user: "what's up", maxTokens: 64 },
      "AIza_TEST_aaaa",
      "gemini-2.5-flash",
      fetchImpl,
      5_000,
    );

    expect(out).toBe("hi from gemini");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toMatch(
      /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash:generateContent\?key=AIza_TEST_aaaa$/,
    );
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("you are a quant");
    expect(body.contents[0].parts[0].text).toBe("what's up");
    expect(body.generationConfig.maxOutputTokens).toBe(64);
  });

  it("URL-encodes the model name (in case of slashes / colons)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
    );
    await callGemini(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "models/exp-with/slash",
      fetchImpl,
      5_000,
    );
    expect(fetchImpl.mock.calls[0][0]).toContain(
      encodeURIComponent("models/exp-with/slash"),
    );
  });

  it("joins multiple part texts in candidate content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        candidates: [
          {
            content: {
              parts: [{ text: "line1\n" }, { text: "line2" }],
            },
          },
        ],
      }),
    );
    const out = await callGemini(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "gemini-2.5-flash",
      fetchImpl,
      5_000,
    );
    expect(out).toBe("line1\nline2");
  });
});

describe("callGemini — error paths", () => {
  it("returns null on HTTP error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(403, { error: { message: "API_KEY_INVALID" } }));
    const out = await callGemini(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "gemini-2.5-flash",
      fetchImpl,
      5_000,
    );
    expect(out).toBeNull();
  });

  it("returns null on no candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { candidates: [] }));
    const out = await callGemini(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "gemini-2.5-flash",
      fetchImpl,
      5_000,
    );
    expect(out).toBeNull();
  });

  it("returns null on missing parts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { candidates: [{ content: {} }] }),
    );
    const out = await callGemini(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "gemini-2.5-flash",
      fetchImpl,
      5_000,
    );
    expect(out).toBeNull();
  });

  it("returns null on network error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    const out = await callGemini(
      { system: "s", user: "u", maxTokens: 10 },
      "k",
      "gemini-2.5-flash",
      fetchImpl,
      5_000,
    );
    expect(out).toBeNull();
  });
});
