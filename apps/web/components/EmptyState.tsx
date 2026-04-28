"use client";

import * as React from "react";

interface Props {
  /** Big emoji/icon up top */
  icon?: string;
  title: string;
  body?: React.ReactNode;
  /** Call-to-action — pass a button or link */
  action?: React.ReactNode;
  /** Compact = smaller padding for inline cards */
  compact?: boolean;
}

export function EmptyState({ icon = "📭", title, body, action, compact }: Props) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: compact ? "24px 16px" : "48px 24px",
        color: "#9ca3af",
      }}
    >
      <div style={{ fontSize: compact ? 32 : 48, lineHeight: 1, marginBottom: compact ? 10 : 16, opacity: 0.6 }}>
        {icon}
      </div>
      <div style={{ fontSize: compact ? 14 : 16, color: "#f2f4f8", fontWeight: 600, marginBottom: 6 }}>
        {title}
      </div>
      {body && (
        <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 460, margin: "0 auto" }}>
          {body}
        </div>
      )}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}
