"use client";

import * as React from "react";

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  /** width — number = px, string = CSS unit. Default: "100%" */
  width?: number | string;
  /** height in px. Default: 14 */
  height?: number | string;
  /** rounded corners. Default: 6 */
  radius?: number | string;
}

const KEY = "pulse-skel";

export function Skeleton({ width = "100%", height = 14, radius = 6, style, ...rest }: Props) {
  return (
    <div
      {...rest}
      style={{
        width,
        height,
        borderRadius: radius,
        background: "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)",
        backgroundSize: "200% 100%",
        animation: `${KEY}-shimmer 1.4s linear infinite`,
        ...style,
      }}
    >
      <style>{`
        @keyframes ${KEY}-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

export function SkeletonRows({ rows = 5, gap = 12 }: { rows?: number; gap?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Skeleton width={28} height={28} radius={8} />
          <Skeleton width="40%" />
          <Skeleton width="20%" />
          <Skeleton width={80} height={28} radius={4} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 280 }: { height?: number }) {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <Skeleton width="35%" height={11} />
      <Skeleton width="60%" height={28} />
      <Skeleton width="100%" height={height - 80} radius={10} />
    </div>
  );
}
