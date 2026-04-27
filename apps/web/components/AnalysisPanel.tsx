"use client";

import { useEffect, useState } from "react";
import { Card, Pill } from "@pulse/ui";
import type { FundflowSnapshot } from "@pulse/sources";

type Mode = "overview" | "deep" | "scenario";

const MODES: Array<{ mode: Mode; label: string; desc: string }> = [
  { mode: "overview", label: "Overview", desc: "สรุปภาพรวม + key signals" },
  { mode: "deep", label: "Deep Read", desc: "Market structure + capital rotation" },
  { mode: "scenario", label: "Scenarios", desc: "Bull / Base / Bear · 30 วัน" },
];

export function AnalysisPanel() {
  const [snapshot, setSnapshot] = useState<FundflowSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("overview");
  const [question, setQuestion] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [thinking, setThinking] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/snapshot")
      .then((r) => r.json())
      .then((d) => setSnapshot(d as FundflowSnapshot))
      .catch((e) => setError((e as Error).message))
      .finally(() => setSnapshotLoading(false));
  }, []);

  async function runAnalysis() {
    if (!snapshot) return;
    setStreaming(true);
    setAnalysis("");
    setThinking("");
    setError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot, question: question.trim() || undefined, mode }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "text") setAnalysis((p) => p + (evt.text as string));
            else if (evt.type === "thinking") setThinking((p) => p + (evt.text as string));
            else if (evt.type === "error") throw new Error(evt.error as string);
          } catch {
            // skip malformed
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.01em" }}>AI Analyst</h2>
        <Pill tone={snapshotLoading ? "flat" : snapshot ? "up" : "down"}>
          {snapshotLoading ? "FETCHING SNAPSHOT" : snapshot ? "SNAPSHOT READY" : "FAILED"}
        </Pill>
      </div>

      <Card>
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {MODES.map((m) => {
            const active = m.mode === mode;
            return (
              <button
                key={m.mode}
                type="button"
                onClick={() => setMode(m.mode)}
                style={{
                  background: active ? "rgba(124,92,255,0.15)" : "transparent",
                  border: `1px solid ${active ? "rgba(124,92,255,0.4)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 12,
                  color: active ? "#a78bfa" : "#9ca3af",
                  padding: "10px 16px",
                  fontSize: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  flex: "1 1 200px",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{m.desc}</div>
              </button>
            );
          })}
        </div>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="ถามคำถามเฉพาะ (optional) — เว้นว่างไว้เพื่อใช้ default prompt ของ mode"
          rows={3}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            color: "#f2f4f8",
            padding: 12,
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            onClick={runAnalysis}
            disabled={!snapshot || streaming}
            style={{
              background: "linear-gradient(135deg,#7c5cff 0%,#22d3ee 100%)",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              padding: "10px 22px",
              fontSize: 13,
              fontWeight: 600,
              cursor: !snapshot || streaming ? "not-allowed" : "pointer",
              opacity: !snapshot || streaming ? 0.5 : 1,
              fontFamily: "inherit",
              letterSpacing: "0.04em",
            }}
          >
            {streaming ? "ANALYZING…" : "RUN ANALYSIS"}
          </button>
        </div>
      </Card>

      {error && (
        <Card style={{ marginTop: 16 }} accent="red" glow>
          <p style={{ color: "#f87171", margin: 0 }}>Error: {error}</p>
        </Card>
      )}

      {thinking && (
        <Card style={{ marginTop: 16 }}>
          <details>
            <summary style={{ cursor: "pointer", fontSize: 11, color: "#9ca3af", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Thinking ({thinking.length} chars)
            </summary>
            <pre style={{ marginTop: 12, fontSize: 12, color: "#9ca3af", whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
              {thinking}
            </pre>
          </details>
        </Card>
      )}

      {analysis && (
        <Card style={{ marginTop: 16 }}>
          <pre style={{ margin: 0, fontSize: 14, color: "#f2f4f8", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.6 }}>
            {analysis}
          </pre>
        </Card>
      )}
    </div>
  );
}
