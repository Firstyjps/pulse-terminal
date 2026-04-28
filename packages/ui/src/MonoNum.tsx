"use client";

import * as React from "react";

export interface MonoNumProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Numeric value to track for tick-flash. Pass undefined while loading. */
  value?: number | null;
  /** Pre-formatted display string (we don't format here — formatters live in @pulse/sources). */
  children: React.ReactNode;
  /** Font size in px. Default 14. */
  size?: number;
  /** Font weight. Default 600. */
  weight?: number;
  /** Whether to flash phosphor on tick. Default true. */
  flash?: boolean;
}

/**
 * MonoNum — a tabular-nums numeric span that flashes phosphor on tick.
 *
 * Detects value changes via useRef + useEffect, then briefly applies
 * `data-phosphor="up" | "down"` for the CSS keyframe (defined in globals.css)
 * to fire. After the animation, the attribute is cleared.
 */
export function MonoNum({
  value,
  children,
  size = 14,
  weight = 600,
  flash = true,
  style,
  ...rest
}: MonoNumProps) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const prev = React.useRef<number | null | undefined>(value);

  React.useEffect(() => {
    if (!flash) return;
    const cur = value;
    const before = prev.current;
    prev.current = cur;
    if (cur == null || before == null) return;
    if (cur === before) return;
    const dir = cur > before ? "up" : "down";
    const el = ref.current;
    if (!el) return;
    el.setAttribute("data-phosphor", dir);
    const id = window.setTimeout(() => el.removeAttribute("data-phosphor"), 820);
    return () => window.clearTimeout(id);
  }, [value, flash]);

  return (
    <span
      ref={ref}
      {...rest}
      className={["mono-num", rest.className].filter(Boolean).join(" ") || undefined}
      style={{
        fontSize: size,
        fontWeight: weight,
        display: "inline-block",
        ...style,
      }}
    >
      {children}
    </span>
  );
}
