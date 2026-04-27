// Shared fetch helpers — every adapter uses these.
// Pattern from CryptoTerminal/CLAUDE.md — retry + fallback chain.

const UA = "PulseTerminal/1.0";

export interface FetchOpts {
  revalidate?: number;     // Next.js cache hint, seconds
  headers?: Record<string, string>;
  retries?: number;
  retryDelayMs?: number;
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { revalidate = 120, headers = {}, retries = 0, retryDelayMs = 800 } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        next: { revalidate },
        headers: { "User-Agent": UA, ...headers },
      } as RequestInit);
      if (!res.ok) throw new Error(`${url} → ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Try each loader in order until one returns a non-null value.
 * Last resort: throw the final error if all fail and no fallback value provided.
 */
export async function withFallback<T>(
  loaders: Array<() => Promise<T | null | undefined>>,
  fallback?: T,
): Promise<T> {
  let lastErr: unknown;
  for (const load of loaders) {
    try {
      const value = await load();
      if (value != null) return value;
    } catch (err) {
      lastErr = err;
    }
  }
  if (fallback !== undefined) return fallback;
  throw lastErr instanceof Error ? lastErr : new Error("all fallbacks failed");
}
