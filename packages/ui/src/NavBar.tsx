import * as React from "react";
import { colors, fonts, gradients, glows, radii } from "./tokens";

export interface NavTab {
  id: string;
  label: string;
}

export interface NavBarProps {
  brand?: string;
  brandAccent?: string;
  subtitle?: string;
  tabs?: NavTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  liveLabel?: React.ReactNode;
  /** Override the default lightning-bolt brand mark. */
  brandIcon?: React.ReactNode;
  style?: React.CSSProperties;
}

const DefaultBrandIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    width={22}
    height={22}
  >
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const liveDotKeyframes = `@keyframes pulseUiLiveDot { 50% { opacity: 0.4; } }`;

export function NavBar({
  brand = "PULSE",
  brandAccent = "COMMAND",
  subtitle = "Crypto Macro Intelligence Terminal",
  tabs = [],
  activeTab,
  onTabChange,
  liveLabel,
  brandIcon,
  style,
}: NavBarProps) {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        background: "rgba(4,5,10,0.7)",
        borderBottom: `1px solid ${colors.line}`,
        ...style,
      }}
    >
      <style>{liveDotKeyframes}</style>
      <div
        style={{
          maxWidth: 1640,
          margin: "0 auto",
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: radii.md,
              background: gradients.purple,
              display: "grid",
              placeItems: "center",
              boxShadow: glows.purple,
              position: "relative",
              overflow: "hidden",
              color: "#fff",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 30% 20%,rgba(255,255,255,0.4),transparent 50%)",
              }}
            />
            <span style={{ position: "relative", zIndex: 1, display: "inline-flex" }}>
              {brandIcon ?? DefaultBrandIcon}
            </span>
          </div>
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "-0.01em",
                color: colors.txt1,
              }}
            >
              {brand}
              {brandAccent && (
                <span style={{ fontWeight: 300, opacity: 0.65 }}> {brandAccent}</span>
              )}
            </div>
            <div
              style={{
                fontSize: 10,
                color: colors.txt3,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {subtitle}
            </div>
          </div>
        </div>

        {/* Tabs */}
        {tabs.length > 0 && (
          <div style={{ display: "flex", gap: 4 }}>
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange?.(tab.id)}
                  style={{
                    background: active ? colors.bg4 : "none",
                    border: "none",
                    padding: "8px 14px",
                    borderRadius: 10,
                    fontFamily: "inherit",
                    fontSize: 12,
                    color: active ? colors.txt1 : colors.txt2,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all .2s ease",
                    letterSpacing: "0.04em",
                    boxShadow: active ? `inset 0 0 0 1px ${colors.line2}` : undefined,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Live pill */}
        {liveLabel !== undefined && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: radii.pill,
              background: colors.bg3,
              border: `1px solid ${colors.line2}`,
              fontSize: 11,
              fontFamily: fonts.mono,
              color: colors.txt2,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: colors.green,
                boxShadow: "0 0 0 4px rgba(52,211,153,0.18)",
                animation: "pulseUiLiveDot 2s ease-in-out infinite",
              }}
            />
            {liveLabel}
          </div>
        )}
      </div>
    </nav>
  );
}
