import type { Config } from "tailwindcss";
// Import tokens directly from source — pulling the @pulse/ui barrel forces
// PostCSS/Node to resolve the package's React components, which fails when
// loading through tailwind's TS config loader.
import { colors, gradients } from "../../packages/ui/src/tokens";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          0: colors.bg0,
          1: colors.bg1,
          2: colors.bg2,
          3: colors.bg3,
          4: colors.bg4,
        },
        line: {
          DEFAULT: colors.line,
          2: colors.line2,
          3: colors.line3,
        },
        txt: {
          1: colors.txt1,
          2: colors.txt2,
          3: colors.txt3,
          4: colors.txt4,
        },
        accent: colors.accent,
        accent2: colors.accent2,
        green: colors.green,
        red: colors.red,
        gold: colors.gold,
        btc: colors.btc,
        eth: colors.eth,
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "IBM Plex Sans Thai", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Courier New", "monospace"],
        thai: ["IBM Plex Sans Thai", "Inter", "sans-serif"],
      },
      backgroundImage: {
        "grad-purple": gradients.purple,
        "grad-bull": gradients.bull,
        "grad-bear": gradients.bear,
        "grad-gold": gradients.gold,
        "grad-card": gradients.card,
      },
    },
  },
  plugins: [],
};

export default config;
