import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, withFallback } from "./_helpers.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

describe("fetchJson", () => {
  it("uses Next revalidation by default", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchJson<{ ok: boolean }>("https://example.test/data", { revalidate: 600 });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/data",
      expect.objectContaining({
        next: { revalidate: 600 },
      }),
    );
  });

  it("uses no-store without Next revalidation for oversized responses", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    globalThis.fetch = fetchMock as typeof fetch;

    await fetchJson<{ ok: boolean }>("https://example.test/large", { cache: "no-store" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/large",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("next");
  });
});

describe("withFallback", () => {
  it("returns the first non-null loader value", async () => {
    const result = await withFallback<string>([
      async () => null,
      async () => "second",
      async () => "third",
    ]);
    expect(result).toBe("second");
  });

  it("skips loaders that throw and continues", async () => {
    const result = await withFallback<string>([
      async () => {
        throw new Error("boom");
      },
      async () => "recovered",
    ]);
    expect(result).toBe("recovered");
  });

  it("treats undefined like null and tries next loader", async () => {
    const result = await withFallback<string>([
      async () => undefined,
      async () => "ok",
    ]);
    expect(result).toBe("ok");
  });

  it("returns the fallback value when every loader fails or yields nullish", async () => {
    const result = await withFallback<string>(
      [
        async () => null,
        async () => undefined,
        async () => {
          throw new Error("nope");
        },
      ],
      "default",
    );
    expect(result).toBe("default");
  });

  it("throws the last error when no fallback is provided and everything fails", async () => {
    await expect(
      withFallback<string>([
        async () => null,
        async () => {
          throw new Error("final");
        },
      ]),
    ).rejects.toThrow("final");
  });
});
