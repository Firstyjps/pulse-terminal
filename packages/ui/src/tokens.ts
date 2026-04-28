// Design tokens — BLOOMBERG TERMINAL (CryptoPulse)
// Source: /design_handoff_cryptopulse/README.md + CryptoPulse Terminal.html
//
// Identity: Bloomberg-style amber-on-black trading terminal.
// 11px JetBrains Mono base, sharp 0 corners, capillary borders, CRT scanline.
//
// Old export names (bg0..bg4, accent, accent2, line, line2, txt1..txt4, glows)
// are preserved so non-Overview consumers keep compiling — values map onto the
// new Bloomberg surface so the entire app picks up the amber language at once.

export const colors = {
  // Substrate + elevation tiers
  bg0: "#07090b",            // page substrate
  bg1: "#0b0e12",            // panel surface
  bg2: "#10141a",            // panel header / hover
  bg3: "#161b22",            // inset / icon background
  bg4: "#10141a",            // legacy alias (was hot tier — Bloomberg uses bg-2 for hover)

  // Borders — solid hex per handoff
  line: "#1d242d",
  line2: "#2a323c",
  line3: "#2a323c",          // legacy alias

  // Foreground (text scale) — handoff names
  txt1: "#e6edf5",           // --fg-1 (emphasized / large numbers)
  txt2: "#c8d1dc",           // --fg  (primary text)
  txt3: "#7d8a99",           // --mid (secondary labels)
  txt4: "#4b5563",           // --dim (tertiary / hints)

  // Brand accents
  accent: "#ffb000",         // --amber (primary brand) was phosphor
  accent2: "#44c8ff",        // --cyan  (secondary accent / FLOW tag)

  // Signal palette (Bloomberg)
  green: "#19d27a",          // up / positive
  green2: "#0a6b3d",         // green-dim (border)
  red: "#ff4d5e",            // down / negative
  red2: "#7a1f29",           // red-dim (border)
  orange: "#ff8a4d",         // amber-warm (gauge mid-range)
  gold: "#ffb000",           // alias for amber
  pink: "#ff5cf3",           // --magenta (OI tag)
  btc: "#ffb000",            // BTC stays amber in Bloomberg theme
  eth: "#627eea",            // ETH brand kept (still recognisable)

  // Bloomberg-specific (new tokens, additive)
  amber: "#ffb000",
  amberBright: "#ffd400",
  amberDim: "#8a5f00",
  cyan: "#44c8ff",
  magenta: "#ff5cf3",
} as const;

export const gradients = {
  // No gradients in Bloomberg — kept for legacy. Render as flat amber.
  purple: "linear-gradient(135deg,#ffb000 0%,#ffd400 100%)",
  bull: "linear-gradient(180deg,#19d27a 0%,#0a6b3d 100%)",
  bear: "linear-gradient(180deg,#ff4d5e 0%,#7a1f29 100%)",
  gold: "linear-gradient(180deg,#ffb000 0%,#ffd400 100%)",
  card: "none", // no surface highlight in Bloomberg
} as const;

export const glows = {
  // Bloomberg is FLAT — no shadows, no blur. Tokens kept as no-op for compat.
  purple: "none",
  cyan: "none",
  gold: "none",
  card: "none",
  hot: "none",
} as const;

export const fonts = {
  // Mono everywhere by default — Bloomberg signature.
  display: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  body: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  mono: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
  sans: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  thai: "'IBM Plex Sans Thai', 'Inter', sans-serif",
} as const;

export const radii = {
  // Bloomberg has NO rounded corners — everything is sharp 90°.
  sm: "0",
  md: "0",
  lg: "0",
  xl: "0",
  pill: "0",
} as const;

export const elevation = {
  tier1: { bg: colors.bg1, border: colors.line },
  tier2: { bg: colors.bg2, border: colors.line2 },
  tier3: { bg: colors.bg3, border: colors.line2 },
} as const;

export type Colors = typeof colors;
export type Gradients = typeof gradients;
