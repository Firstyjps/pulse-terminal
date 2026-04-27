import { describe, expect, it } from "vitest";
import { withFallback } from "./_helpers.js";

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
