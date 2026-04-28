import * as React from "react";
import { colors, fonts } from "./tokens";

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
        background: colors.bg1,
        borderBottom: `1px solid ${colors.line}`,
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset",
        ...style,
      }}
    >
      <div
        style={{
          maxWidth: "100%",
          margin: 0,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 3,
              background: colors.bg3,
              border: `1px solid ${colors.line2}`,
              display: "grid",
              placeItems: "center",
              boxShadow: "0 0 0 1px rgba(65,255,139,0.15), 0 0 14px -2px rgba(65,255,139,0.25)",
              position: "relative",
              overflow: "hidden",
              color: colors.accent,
            }}
          >
            <span style={{ position: "relative", zIndex: 1, display: "inline-flex" }}>
              {brandIcon ?? DefaultBrandIcon}
            </span>
          </div>
          <div>
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: colors.txt1,
                lineHeight: 1.05,
              }}
            >
              {brand}
              {brandAccent && (
                <span style={{ fontWeight: 400, opacity: 0.55, marginLeft: 4 }}>·{brandAccent}</span>
              )}
            </div>
            <div
              className="bsub"
              style={{
                fontFamily: fonts.mono,
                fontSize: 9,
                color: colors.txt3,
                letterSpacing: "0.20em",
                textTransform: "uppercase",
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          </div>
        </div>

        {/* Tabs */}
        {tabs.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 0,
              border: `1px solid ${colors.line}`,
              borderRadius: 3,
              overflow: "hidden",
              background: colors.bg2,
            }}
          >
            {tabs.map((tab, i) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange?.(tab.id)}
                  style={{
                    background: active ? colors.bg4 : "transparent",
                    border: "none",
                    borderLeft: i > 0 ? `1px solid ${colors.line}` : "none",
                    padding: "10px 18px",
                    fontFamily: fonts.mono,
                    fontSize: 12,
                    color: active ? colors.accent : colors.txt2,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all .14s ease",
                    letterSpacing: "0.10em",
                    position: "relative",
                  }}
                >
                  {active && (
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: -1,
                        height: 1,
                        background: colors.accent,
                        boxShadow: `0 0 8px ${colors.accent}`,
                      }}
                    />
                  )}
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
              gap: 10,
              padding: "7px 14px",
              borderRadius: 3,
              background: colors.bg2,
              border: `1px solid ${colors.line2}`,
              fontSize: 12,
              fontFamily: fonts.mono,
              color: colors.txt2,
              letterSpacing: "0.12em",
              fontWeight: 700,
            }}
          >
            <span
              aria-hidden
              className="live-dot"
            />
            {liveLabel}
          </div>
        )}
      </div>
    </nav>
  );
}
