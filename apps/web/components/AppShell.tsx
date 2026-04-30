"use client";

import { usePathname } from "next/navigation";
import { ToastProvider } from "./ToastProvider";
import { AlertWatcher } from "./AlertWatcher";
import { TerminalStatusBar } from "./TerminalStatusBar";
import { TerminalTicker } from "./TerminalTicker";
import { TerminalNav } from "./TerminalNav";
import { TerminalBotBar } from "./TerminalBotBar";
import { BottomTabNav } from "./BottomTabNav";
import { useIsMobile } from "../lib/use-media";

const SHELL_BYPASS_ROUTES = ["/chart-popup"];

/**
 * AppShell — Bloomberg/CryptoPulse responsive terminal grid.
 *
 *   Desktop (≥ 720px) — 4-row layout per handoff
 *   ┌──────────────────────────────────────────────────────┐
 *   │ TerminalStatusBar                              22px  │
 *   │ TerminalTicker                                 26px  │
 *   │ Nav 140 │ Workspace                            1fr   │
 *   │ TerminalBotBar                                 22px  │
 *   └──────────────────────────────────────────────────────┘
 *
 *   Mobile (< 720px) — collapsed shell, bottom-tab nav
 *   ┌──────────────────────────────────────────────────────┐
 *   │ TerminalStatusBar (compact)                    22px  │
 *   │ TerminalTicker                                 26px  │
 *   │ Workspace (full-width, no left rail)           1fr   │
 *   │ BottomTabNav (F1–F10 tap targets, 56px)        56px  │
 *   └──────────────────────────────────────────────────────┘
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bypass = SHELL_BYPASS_ROUTES.some((p) => pathname?.startsWith(p));
  if (bypass) {
    return <ToastProvider>{children}</ToastProvider>;
  }
  return (
    <ToastProvider>
      <AlertWatcher />
      <Frame>{children}</Frame>
    </ToastProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div
        className="crt"
        style={{
          display: "grid",
          gridTemplateRows: "22px 26px 1fr 56px",
          height: "100vh",
          width: "100vw",
          background: "var(--bg)",
          color: "var(--fg)",
          overflow: "hidden",
        }}
      >
        <TerminalStatusBar compact />
        <TerminalTicker />
        <main
          style={{
            overflow: "auto",
            minHeight: 0,
            minWidth: 0,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </main>
        <BottomTabNav />
      </div>
    );
  }

  return (
    <div
      className="crt"
      style={{
        display: "grid",
        gridTemplateRows: "22px 26px 1fr 22px",
        height: "100vh",
        width: "100vw",
        background: "var(--bg)",
        color: "var(--fg)",
        overflow: "hidden",
      }}
    >
      <TerminalStatusBar />
      <TerminalTicker />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "172px 1fr",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <TerminalNav />
        <main style={{ overflow: "auto", minHeight: 0, minWidth: 0 }}>{children}</main>
      </div>
      <TerminalBotBar />
    </div>
  );
}
