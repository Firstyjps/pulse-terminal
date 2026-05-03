"use client";

import { useSyncExternalStore } from "react";

/**
 * Tailwind-aligned breakpoint helper. Single source of truth for the
 * mobile / tablet / desktop split — these match Tailwind defaults
 * (`md:` = 768, `lg:` = 1024) so JS hooks and CSS utility classes never
 * disagree on the 768–1024 band.
 *
 *   mobile  : < 768px       (single column, bottom-tab nav, card lists)
 *   tablet  : 768 — 1023px  (2-col grids, compact desktop)
 *   desktop : ≥ 1024px      (full Bloomberg 4-row terminal)
 *
 * SSR-safe: `useSyncExternalStore` accepts a server snapshot. We return
 * `"mobile"` on the server so the first paint is mobile-first — content
 * reflows up (mobile → desktop on hydrate) instead of down, which is the
 * less jarring direction. iPhone Safari, the dominant phone runtime here,
 * never sees a desktop-grid flash.
 */
export type Viewport = "mobile" | "tablet" | "desktop";

const MOBILE_MAX = 768;   // < 768  → mobile  (Tailwind md: lower bound)
const TABLET_MAX = 1024;  // < 1024 → tablet  (Tailwind lg: lower bound)

function compute(): Viewport {
  if (typeof window === "undefined") return "mobile";
  const w = window.innerWidth;
  if (w < MOBILE_MAX) return "mobile";
  if (w < TABLET_MAX) return "tablet";
  return "desktop";
}

function subscribe(notify: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let raf = 0;
  const onResize = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(notify);
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", onResize);
  };
}

const getServerSnapshot = (): Viewport => "mobile";

export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, compute, getServerSnapshot);
}

/** `true` on a sub-768px viewport (Tailwind `md:` lower bound). */
export function useIsMobile(): boolean {
  return useViewport() === "mobile";
}

/** `true` on tablet OR mobile (i.e. anything narrower than `lg:` 1024). */
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
