"use client";

import { LocaleProvider } from "@pulse/i18n";
import { ToastProvider } from "./ToastProvider";
import { AlertWatcher } from "./AlertWatcher";
import { TerminalStatusBar } from "./TerminalStatusBar";
import { TerminalTicker } from "./TerminalTicker";
import { TerminalNav } from "./TerminalNav";
import { TerminalBotBar } from "./TerminalBotBar";

/**
 * AppShell — Bloomberg/CryptoPulse 4-row terminal grid.
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ TerminalStatusBar                              22px  │
 *   ├──────────────────────────────────────────────────────┤
 *   │ TerminalTicker                                 26px  │
 *   ├──────────┬───────────────────────────────────────────┤
 *   │ Nav 140  │ Workspace (children, scrollable)     1fr  │
 *   ├──────────┴───────────────────────────────────────────┤
 *   │ TerminalBotBar                                 22px  │
 *   └──────────────────────────────────────────────────────┘
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <ToastProvider>
        <AlertWatcher />
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
              gridTemplateColumns: "140px 1fr",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            <TerminalNav />
            <main style={{ overflow: "hidden", minHeight: 0, minWidth: 0 }}>{children}</main>
          </div>
          <TerminalBotBar />
        </div>
      </ToastProvider>
    </LocaleProvider>
  );
}
