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
