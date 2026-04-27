"use client";

import { dict, type DictKey, type Locale } from "./dict";
import { useLocale } from "./LocaleContext";

/** Resolve a key against a specific locale (server-safe — does not call hooks). */
export function translate(key: DictKey, locale: Locale): string {
  return dict[key][locale];
}

/**
 * Hook returning a `t(key)` function bound to the active locale.
 * Use in client components.
 */
export function useT(): (key: DictKey) => string {
  const [locale] = useLocale();
  return (key) => translate(key, locale);
}

/**
 * Standalone `t()` that resolves against the current `useLocale()`.
 * Note: requires being called inside a React render — for plain JS callers
 * (e.g. metadata builders, tests), use `translate(key, locale)` directly.
 */
export function t(key: DictKey): string {
  const [locale] = useLocale();
  return translate(key, locale);
}
