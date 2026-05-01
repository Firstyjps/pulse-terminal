"use client";

import { useEffect } from "react";
import { useSettings } from "./use-settings";
import { autoUiScale } from "./use-media";

/**
 * Apply Pulse Terminal's UI zoom level to the document.
 *
 * Setting "auto" picks a scale by viewport width (4K → 1.4x, ultrawide
 * 1.25x, otherwise 1x). Numeric values override.
 *
 * Implementation: writes `--ui-scale` on `<html>`. globals.css applies
 * `zoom: var(--ui-scale, 1)` to the body so every pixel-sized component
 * scales proportionally without having to migrate the whole app to rem.
 *
 * Mount once near the top of the tree (AppShell). Re-runs on resize and
 * when the user changes the setting.
 */
export function useUiScale() {
  const { settings } = useSettings();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const apply = () => {
      const scale =
        settings.uiScale === "auto"
          ? autoUiScale(window.innerWidth)
          : settings.uiScale;
      root.style.setProperty("--ui-scale", String(scale));
    };
    apply();

    if (settings.uiScale !== "auto") return;

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [settings.uiScale]);
}
