"use client";

import * as React from "react";
import type { Locale } from "./dict";

const STORAGE_KEY = "pulse.locale";
const DEFAULT_LOCALE: Locale = "th";

interface Ctx {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

const LocaleCtx = React.createContext<Ctx | null>(null);

export interface LocaleProviderProps {
  initial?: Locale;
  children: React.ReactNode;
}

export function LocaleProvider({ initial, children }: LocaleProviderProps) {
  const [locale, setLocaleState] = React.useState<Locale>(initial ?? DEFAULT_LOCALE);

  // Hydrate from localStorage once on mount.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "th" || stored === "en") setLocaleState(stored);
    } catch {
      /* localStorage may be unavailable (SSR, sandbox) — fine. */
    }
  }, []);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const value = React.useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

/** Returns `[locale, setLocale]`. Falls back to default outside a provider. */
export function useLocale(): [Locale, (next: Locale) => void] {
  const ctx = React.useContext(LocaleCtx);
  if (ctx) return [ctx.locale, ctx.setLocale];
  // outside provider — read-only fallback (won't update)
  return [DEFAULT_LOCALE, () => undefined];
}
