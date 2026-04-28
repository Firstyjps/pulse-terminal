"use client";

import { useState } from "react";
import { useToast } from "./ToastProvider";

interface Props {
  /** Endpoint that returns the markdown brief to copy. Default: `/api/snapshot` formatted via `summarizeSnapshot()`. */
  endpoint?: string;
  /** Optional ?symbol= param appended to endpoint */
  symbol?: string;
  /** Button label override */
  label?: string;
  /** Suggested follow-up question prepended to the clipboard payload */
  suggestion?: string;
}

const DEFAULT_SUGGESTION = "วิเคราะห์ snapshot นี้แล้วบอกว่ามี signals อะไรน่าสนใจ + scenarios 1-2 สัปดาห์";

export function MCPQuickAsk({
  endpoint = "/api/snapshot",
  symbol,
  label = "Ask Claude",
  suggestion = DEFAULT_SUGGESTION,
}: Props) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function copy() {
    setBusy(true);
    try {
      const url = symbol ? `${endpoint}?symbol=${symbol}` : endpoint;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const md = renderMarkdown(data, suggestion);
      await navigator.clipboard.writeText(md);
      toast.push({
        tone: "success",
        title: "📋 Copied to clipboard",
        body: "วาง (Ctrl/⌘+V) ใน Claude Desktop ได้เลย — หรือเปิด MCP tools ตรงๆ ก็ได้",
        ttlMs: 6000,
      });
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Copy failed",
        body: (err as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={busy}
      title="Copy a markdown summary of this view → paste into Claude Desktop for AI analysis"
      style={{
        background: "rgba(65,255,139,0.08)",
        border: "1px solid rgba(65,255,139,0.35)",
        borderRadius: 2,
        color: "#41ff8b",
        padding: "5px 11px",
        fontSize: 11.5,
        cursor: busy ? "wait" : "pointer",
        fontFamily: "JetBrains Mono, monospace",
        fontWeight: 700,
        letterSpacing: "0.10em",
        opacity: busy ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        textTransform: "uppercase",
        boxShadow: busy ? undefined : "0 0 0 1px rgba(65,255,139,0.12), 0 0 12px -4px rgba(65,255,139,0.35)",
      }}
    >
      <span aria-hidden style={{ fontSize: 11 }}>{busy ? "⋯" : "›"}</span>
      {busy ? "COPYING…" : label.toUpperCase()}
    </button>
  );
}

function renderMarkdown(data: unknown, suggestion: string): string {
  // Try to render as a fund-flow snapshot markdown brief; otherwise dump JSON.
  if (data && typeof data === "object" && "generatedAt" in data) {
    const s = data as Record<string, unknown>;
    const ts = String(s.generatedAt ?? new Date().toISOString());
    let out = `# Pulse Terminal Snapshot · ${ts}\n\n`;
    out += "```json\n" + JSON.stringify(data, null, 2).slice(0, 4000) + "\n```\n\n";
    out += `---\n\n**คำถาม:** ${suggestion}\n`;
    return out;
  }
  return (
    `# Pulse Terminal data\n\n` +
    "```json\n" + JSON.stringify(data, null, 2).slice(0, 4000) + "\n```\n\n" +
    `---\n\n**คำถาม:** ${suggestion}\n`
  );
}
