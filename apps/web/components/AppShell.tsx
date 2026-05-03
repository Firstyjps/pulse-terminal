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
import { useUiScale } from "../lib/use-ui-scale";

const SHELL_BYPASS_ROUTES = ["/chart-popup"];

/**
 * AppShell — Bloomberg/CryptoPulse responsive terminal grid.
 *
 *   Desktop (≥ 768px) — 4-row layout per handoff
 *   ┌──────────────────────────────────────────────────────┐
 *   │ TerminalStatusBar                              22px  │
 *   │ TerminalTicker                                 26px  │
 *   │ Nav 140 │ Workspace                            1fr   │
 *   │ TerminalBotBar                                 22px  │
 *   └──────────────────────────────────────────────────────┘
 *
 *   Mobile (< 768px) — collapsed shell, bottom-tab nav
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
  useUiScale();

  if (isMobile) {
    // Pin the shell to the dynamic viewport (100dvh follows iOS Safari's
    // address-bar collapse) so the inner <main> scrolls and the BottomTabNav
    // stays anchored at the bottom edge. After Phase 0 loosened html/body to
    // natural document scroll, using `height: 100%` here let the shell grow
    // to content height and pushed the tab nav off-screen during scroll.
    return (
      <div
        className="crt"
        style={{
          display: "grid",
          gridTemplateRows: "22px 26px 1fr 56px",
          height: "100dvh",
          width: "100%",
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
        height: "100%",
        width: "100%",
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
