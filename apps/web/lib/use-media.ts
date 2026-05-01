"use client";

import { useEffect, useState } from "react";

/**
 * Tailwind-ish breakpoint helper.
 *
 *   mobile  : < 720px       (single column, bottom-tab nav, card lists)
 *   tablet  : 720 — 1024px  (2-col grids, compact desktop)
 *   desktop : ≥ 1024px      (full Bloomberg 4-row terminal)
 *
 * Returns `null` until first `useEffect` flush (avoids SSR ↔ client mismatch).
 * Treat `null` as "desktop" while painting first frame so the server-rendered
 * markup keeps the desktop layout intact.
 */
export type Viewport = "mobile" | "tablet" | "desktop";

export function useViewport(): Viewport | null {
  const [vp, setVp] = useState<Viewport | null>(null);

  useEffect(() => {
    const compute = (): Viewport => {
      const w = window.innerWidth;
      if (w < 720) return "mobile";
      if (w < 1024) return "tablet";
      return "desktop";
    };
    setVp(compute());
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp(compute()));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return vp;
}

/** Convenience: `true` once mounted on a sub-720px viewport. */
export function useIsMobile(): boolean {
  const vp = useViewport();
  return vp === "mobile";
}

/** Convenience: `true` once mounted on tablet OR mobile. */
export function useIsCompact(): boolean {
  const vp = useViewport();
  return vp === "mobile" || vp === "tablet";
}

/**
 * Auto scale-factor based on viewport width.
 *   < 2400px  → 1     (laptop / standard desktop / iPad / phone)
 *   < 3000px  → 1.25  (QHD ultrawide 3440×1440, 27" 1440p at 100%)
 *   ≥ 3000px  → 1.4   (4K 3840×2160 at native scaling)
 *
 * Used by `useUiScale` when the user picks "auto" in Settings. Intentionally
 * does not scale phones/tablets — those already get viewport-based layouts.
 */
export function autoUiScale(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  if (width >= 3000) return 1.4;
  if (width >= 2400) return 1.25;
  return 1;
}
