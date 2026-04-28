"use client";

import * as React from "react";

type ToastTone = "info" | "success" | "warning" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  ttlMs?: number;
}

interface Ctx {
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

const ToastCtx = React.createContext<Ctx | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) {
    // No-op fallback so callers don't need to wrap every test
    return { push: () => undefined, dismiss: () => undefined };
  }
  return ctx;
}

const TONE_STYLES: Record<ToastTone, { border: string; accent: string; icon: string }> = {
  info:    { border: "rgba(34,211,238,0.4)",  accent: "#22d3ee", icon: "ⓘ" },
  success: { border: "rgba(52,211,153,0.4)",  accent: "#34d399", icon: "✓" },
  warning: { border: "rgba(251,191,36,0.4)",  accent: "#fbbf24", icon: "⚠" },
  error:   { border: "rgba(248,113,113,0.4)", accent: "#f87171", icon: "✕" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const idRef = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (t: Omit<Toast, "id">) => {
      // Honour the notificationsMuted setting from localStorage at push-time.
      // Manual user actions (e.g. "Reset complete" success toast) still fire
      // because we only mute warning + error tones.
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem("pulse.settings") : null;
        if (raw) {
          const s = JSON.parse(raw) as { notificationsMuted?: boolean };
          if (s.notificationsMuted && (t.tone === "warning" || t.tone === "error")) return;
        }
      } catch { /* localStorage unavailable */ }

      const id = ++idRef.current;
      setToasts((prev) => [...prev, { ...t, id }]);
      const ttl = t.ttlMs ?? 5000;
      if (ttl > 0) {
        setTimeout(() => dismiss(id), ttl);
      }
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={{ push, dismiss }}>
      {children}
      <div
        style={{
          position: "fixed",
          top: 80,
          right: 24,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 380,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          const tone = TONE_STYLES[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              aria-live="polite"
              style={{
                pointerEvents: "auto",
                background: "rgba(13,17,29,0.92)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: `1px solid ${tone.border}`,
                borderRadius: 12,
                padding: "12px 14px",
                boxShadow: "0 14px 40px -12px rgba(0,0,0,0.7)",
                display: "flex",
                gap: 10,
                animation: "pulse-toast-in 0.25s ease-out",
              }}
            >
              <span style={{ color: tone.accent, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{tone.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#f2f4f8", fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{t.title}</div>
                {t.body && (
                  <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{t.body}</div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="dismiss"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6b7280",
                  cursor: "pointer",
                  fontSize: 14,
                  alignSelf: "flex-start",
                  padding: 0,
                  marginLeft: 4,
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes pulse-toast-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastCtx.Provider>
  );
}
