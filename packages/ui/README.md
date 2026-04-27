# @pulse/ui

Design system + tokens. Visual identity: purple/cyan glassmorphism (Pulse Command aesthetic).
Owned by **Role 2 (UI Agent)** in [../../AGENTS.md](../../AGENTS.md).

## Public API

```ts
import {
  // tokens
  colors, gradients, glows, fonts, radii,
  // components
  Card, MetricCard, Pill, HeroTitle, NavBar, Loader, ThreeBackground,
} from "@pulse/ui";
```

### Components

| Component         | Purpose                                                                        |
|-------------------|--------------------------------------------------------------------------------|
| `Card`            | Glassmorphism container with optional accent glow + hover-lift.                |
| `MetricCard`      | Label / value / delta / meta block, built on `Card`. Accepts an optional spark.|
| `Pill`            | Small mono-font badge — tones: `up`, `down`, `flat`, `gold`, `purple`, `cyan`, `btc`, `eth`. |
| `HeroTitle`       | Pulse Command display headline (gradient primary + solid secondary).           |
| `NavBar`          | Sticky blur navigation with brand mark, tabs, and live pill.                   |
| `Loader`          | Full-screen progress overlay (determinate or indeterminate).                   |
| `ThreeBackground` | Three.js particle field + crypto orbs — drop-in fixed-position canvas.         |

### Token highlights

- **Background:** `#04050a`
- **Accents:** `#7c5cff` (purple) + `#22d3ee` (cyan)
- **Fonts:** Space Grotesk, Inter, JetBrains Mono, IBM Plex Sans Thai

Full token set in [src/tokens.ts](./src/tokens.ts).

## Notes for consumers

- `ThreeBackground` is a client component (`"use client"`); render it in a Next.js client boundary.
- Components ship as inline-styled React — no Tailwind, no global CSS — so they drop into any host without leak.
- Keep components SSR-safe: only `ThreeBackground` touches `window`, and it does so inside `useEffect`.

## Showcase

A visual showcase route lives in [`apps/web/app/design/page.tsx`](../../apps/web) (URL `/design`) and is owned by Role 6.
