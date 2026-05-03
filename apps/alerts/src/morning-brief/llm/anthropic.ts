// Anthropic adapter — uses @anthropic-ai/sdk (already a dep).
// Could be raw fetch like the others, but the SDK is already installed and
// keeps the call site terse + handles the messages content-block shape.
//
// Timeout: SDK default is 600s × maxRetries=2 → up to 30 min on a stalled
// upstream. Wire AbortController via the per-request `signal` option so a
// stuck cron run aborts within timeoutMs instead of pinning the worker.

import Anthropic from "@anthropic-ai/sdk";
import type { LLMCallParams } from "./types.js";

export async function callAnthropic(
  params: LLMCallParams,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create(
      {
        model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: [{ role: "user", content: params.user }],
      },
      { signal: ctrl.signal },
    );
    const text = msg.content
      .filter((b): b is { type: "text"; text: string } & typeof b => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || null;
  } catch (err) {
    console.warn(`[llm] anthropic call failed:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}
