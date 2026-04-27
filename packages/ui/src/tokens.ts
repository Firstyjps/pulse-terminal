// Design tokens — extracted from Pulse Command/pulsecommand.html :root block
// Single source of truth. Never hard-code these values elsewhere.

export const colors = {
  bg0: "#04050a",
  bg1: "#080b14",
  bg2: "#0d111d",
  bg3: "#141927",
  bg4: "#1a2032",
  line: "rgba(255,255,255,0.06)",
  line2: "rgba(255,255,255,0.10)",
  line3: "rgba(255,255,255,0.16)",
  txt1: "#f2f4f8",
  txt2: "#9ca3af",
  txt3: "#6b7280",
  txt4: "#404656",
  accent: "#7c5cff",
  accent2: "#22d3ee",
  green: "#34d399",
  green2: "#10b981",
  red: "#f87171",
  red2: "#ef4444",
  orange: "#fb923c",
  gold: "#fbbf24",
  pink: "#f472b6",
  btc: "#f7931a",
  eth: "#627eea",
} as const;

export const gradients = {
  purple: "linear-gradient(135deg,#7c5cff 0%,#22d3ee 100%)",
  bull: "linear-gradient(135deg,#10b981 0%,#34d399 100%)",
  bear: "linear-gradient(135deg,#f87171 0%,#fb923c 100%)",
  gold: "linear-gradient(135deg,#fbbf24 0%,#f59e0b 100%)",
  card: "linear-gradient(180deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.01) 100%)",
} as const;

export const glows = {
  purple: "0 0 80px rgba(124,92,255,0.30)",
  cyan: "0 0 80px rgba(34,211,238,0.25)",
  gold: "0 0 50px rgba(251,191,36,0.30)",
  card: "0 16px 60px -20px rgba(0,0,0,0.60)",
} as const;

export const fonts = {
  display: "'Space Grotesk', sans-serif",
  body: "'Inter', 'IBM Plex Sans Thai', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
  thai: "'IBM Plex Sans Thai', 'Inter', sans-serif",
} as const;

export const radii = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  pill: "999px",
} as const;

export type Colors = typeof colors;
export type Gradients = typeof gradients;
