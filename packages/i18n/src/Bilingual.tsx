"use client";

import * as React from "react";
import type { DictKey } from "./dict";
import { dict } from "./dict";
import { useLocale } from "./LocaleContext";

const FONT_TH = "'IBM Plex Sans Thai', 'Inter', sans-serif";
const FONT_EN = "'Inter', 'IBM Plex Sans Thai', system-ui, sans-serif";

export type BilingualVariant = "stack" | "primary" | "secondary";

export interface BilingualProps {
  /** Lookup against the dictionary. Either pass `dictKey` *or* `th`+`en` literals. */
  dictKey?: DictKey;
  th?: string;
  en?: string;
  /**
   * `stack` — show both, primary big + secondary small (CryptoTerminal layout)
   * `primary` — show only the active locale
   * `secondary` — show only the *other* locale
   */
  variant?: BilingualVariant;
  className?: string;
  style?: React.CSSProperties;
}

export function Bilingual({
  dictKey,
  th,
  en,
  variant = "primary",
  className,
  style,
}: BilingualProps) {
  const [locale] = useLocale();

  const thText = th ?? (dictKey ? dict[dictKey].th : "");
  const enText = en ?? (dictKey ? dict[dictKey].en : "");

  const primary = locale === "th" ? thText : enText;
  const secondary = locale === "th" ? enText : thText;

  const primaryFont = locale === "th" ? FONT_TH : FONT_EN;
  const secondaryFont = locale === "th" ? FONT_EN : FONT_TH;

  if (variant === "primary") {
    return (
      <span className={className} style={{ fontFamily: primaryFont, ...style }}>
        {primary}
      </span>
    );
  }

  if (variant === "secondary") {
    return (
      <span className={className} style={{ fontFamily: secondaryFont, ...style }}>
        {secondary}
      </span>
    );
  }

  // stack
  return (
    <span
      className={className}
      style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.1, ...style }}
    >
      <span style={{ fontFamily: primaryFont, fontWeight: 600 }}>{primary}</span>
      <span
        style={{
          fontFamily: secondaryFont,
          fontSize: "0.72em",
          opacity: 0.6,
          letterSpacing: "0.06em",
        }}
      >
        {secondary}
      </span>
    </span>
  );
}
