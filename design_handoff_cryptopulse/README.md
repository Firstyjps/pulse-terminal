# Handoff: CryptoPulse — Crypto Macro Intelligence Terminal

## Overview

CryptoPulse is a **Bloomberg-style, maxed-density crypto macro intelligence terminal**. The Overview screen aggregates global market state, sentiment, top-mover tables, an asset inspector, a streaming anomaly feed, macro overlay (DXY/SPX/Gold/etc.), and perp funding rates — all in a dark, monospace, amber-on-black terminal aesthetic with a CRT scanline overlay.

Target user: a crypto macro analyst / pro trader who wants every pixel to earn its keep.

---

## About the Design Files

The files in this bundle (`CryptoPulse Terminal.html`, `cryptopulse.jsx`, `tweaks-panel.jsx`) are **design references created in HTML**. They are working prototypes that demonstrate the intended look, layout, interactions, and data shape — **not production code to copy directly**.

The task is to **recreate this design in your target codebase** using its established patterns:

- If the project uses **React + Vite** or **Next.js** — port components to `.tsx`, replace `fetch()` with React Query / SWR, use a real chart library (Recharts / TradingView Lightweight Charts) for the price chart.
- If there's no codebase yet — **Vite + React + TypeScript + Tailwind** is the recommended stack. (Alternative: Next.js if SSR / SEO matter.)

The prototype loads React/Babel via CDN and uses inline JSX — that's a prototyping convenience, not a production pattern.

---

## Fidelity

**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are all specified. Recreate pixel-perfectly using the codebase's component patterns. The aesthetic is intentional and should be preserved closely — Bloomberg-terminal feel is the brand.

---

## Architecture & Layout

### App shell — 4-row CSS grid filling the viewport

```
┌──────────────────────────────────────────────────────────┐
│ Status bar                                          22px │  ← brand · version · user · feed status · clock
├──────────────────────────────────────────────────────────┤
│ Ticker tape (scrolling)                             26px │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│   Nav      │           Workspace                         │
│   140px    │           (scrollable)                  1fr │
│            │                                             │
├────────────┴─────────────────────────────────────────────┤
│ Bottom status bar                                   22px │
└──────────────────────────────────────────────────────────┘
```

CSS:
```css
.app { display: grid; grid-template-rows: 22px 26px 1fr 22px; height: 100vh; }
.main { display: grid; grid-template-columns: 140px 1fr; }
```

### Workspace — Stacked rows, NOT a single 12-col grid

The workspace is a vertical flex of **`ws-row`** containers, each containing a 12-col grid. This was a critical fix: a flat grid let tall panels desync row heights and visually overlap neighbors.

```css
.workspace { display: flex; flex-direction: column; gap: 1px; padding: 1px; background: var(--line); }
.ws-row { display: grid; grid-template-columns: repeat(12, 1fr); gap: 1px; background: var(--line); }
.ws-row.h-stats { min-height: 96px; }
.ws-row.h-chart { height: 360px; }
.ws-row.h-table { height: 340px; }
.ws-row.h-feed  { height: 320px; }
```

Overview screen layout:

| Row              | Columns                                                                  |
|------------------|--------------------------------------------------------------------------|
| `h-stats` (96)   | Market Pulse stats (c-12, six tiles)                                     |
| `h-chart` (360)  | Price chart (c-8) · Fear & Greed gauge (c-4)                             |
| `h-table` (340)  | Top Movers (c-8) · Asset Inspector (c-4)                                 |
| `h-feed` (320)   | Live Anomaly Feed (c-5) · Macro Overlay (c-4) · Funding Rates (c-3)      |

`c-N` = `grid-column: span N`.

---

## Design Tokens

### Colors (CSS variables, all defined on `:root`)

| Token         | Value      | Usage                                        |
|---------------|------------|----------------------------------------------|
| `--bg`        | `#07090b`  | App background (near-black)                  |
| `--bg-1`      | `#0b0e12`  | Panel background                             |
| `--bg-2`      | `#10141a`  | Panel header / hover                         |
| `--bg-3`      | `#161b22`  | Inset / icon background                      |
| `--line`      | `#1d242d`  | Hairline divider (1px between panels)        |
| `--line-2`    | `#2a323c`  | Stronger border (form controls, borders)     |
| `--dim`       | `#4b5563`  | Tertiary text                                |
| `--mid`       | `#7d8a99`  | Secondary text / labels                      |
| `--fg`        | `#c8d1dc`  | Primary text                                 |
| `--fg-1`      | `#e6edf5`  | Emphasized text / large numbers              |
| `--amber`     | `#ffb000`  | Brand accent · titles · selection · keys     |
| `--amber-dim` | `#8a5f00`  | Amber border, decorative                     |
| `--green`     | `#19d27a`  | Up / positive                                |
| `--green-dim` | `#0a6b3d`  | Green border                                 |
| `--red`       | `#ff4d5e`  | Down / negative                              |
| `--red-dim`   | `#7a1f29`  | Red border                                   |
| `--cyan`      | `#44c8ff`  | FLOW tag / secondary accent                  |
| `--magenta`   | `#ff5cf3`  | OI tag                                       |

### Typography

- **Mono (default):** `JetBrains Mono` weights 300/400/500/600/700 — entire UI
- **Sans (Tweak toggle):** `IBM Plex Sans` 400/500/600/700 — softens chrome but numerics stay mono
- Both loaded from Google Fonts
- Body base: `11px / 1.4`, mono. Tabular-nums + `ss01` enabled for `.num` class.
- Sans variant: `12px / 1.4` (slightly larger to match optical density)

| Element                | Size | Weight | Notes                                    |
|------------------------|------|--------|------------------------------------------|
| Status bar             | 10px | 400    | uppercase, letter-spacing 0.06em         |
| Brand pill             | 10px | 700    | uppercase, letter-spacing 0.14em         |
| Panel header title     | 9px  | 600    | uppercase, letter-spacing 0.10em, amber  |
| Panel header dim       | 9px  | 400    | uppercase, color `--mid`                 |
| Stat label             | 9px  | 400    | uppercase, letter-spacing 0.08em         |
| Stat value             | 18px | 500    | mono, letter-spacing -0.02em             |
| Asset inspector price  | 22px | 400    | mono                                     |
| Fear & Greed value     | 38px | 500    | mono, letter-spacing -0.02em             |
| Table cells            | 10.5px | 400  | mono, tabular-nums                       |
| Table headers          | 9px  | 500    | uppercase, letter-spacing 0.08em         |
| Anomaly feed text      | 10px | 400    | mono                                     |
| Anomaly tags           | 9px  | 400    | uppercase, letter-spacing 0.06em         |

### Spacing

- Panel padding: `8px`
- Panel header height: `22px`, padding `4px 8px`
- Stat block padding: `8px 10px`
- Table cell padding: `4px 8px`
- 1px gaps between panels (the `--line` color shows through)

### Other

- **No border-radius anywhere** — sharp 90° corners are part of the brand
- **No shadows** — flat
- CRT scanline overlay: `repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 3px)` with `mix-blend-mode: overlay` at `z-index: 9999`
- Custom scrollbar: 8px, track `--bg-1`, thumb `--line-2`
- Selection: amber background, black text

---

## Screens / Components

### 1. Status Bar (top, 22px)

- Brand pill: amber background `--amber`, black text "◆ CRYPTOPULSE", padding `0 12px`, weight 700, letter-spacing 0.14em
- Segments separated by `border-right: 1px solid --line`, padding `0 10px`, gap 6px
- Left segments: `VER 4.12.0`, `USR ANALYST`, `DESK MACRO·INTEL`
- Right segments: feed status dot + label, `UTC HH:MM:SS`, `DATE YYYY·MM·DD`, `SESS US·EU OVERLAP`
- **Status dot:** 6×6 circle with `box-shadow: 0 0 6px <color>`, pulse animation `1.4s` (opacity 1 → 0.3 → 1)
  - Green (live) / amber (stale) / red (offline)

### 2. Ticker Tape (26px)

- Black background, scrolls right-to-left
- Each item: amber symbol + price + colored % change (▲/▼)
- Animation: `transform: translateX(0 → -100%)` over 90s linear infinite
- Track is duplicated (items doubled) so the loop is seamless
- Items separated by 32px gap

### 3. Left Nav (140px wide)

```
─ INTEL ─
F1  Overview      ← active: amber, 2px amber left border, --bg-2 background
F2  Markets
F3  Fundflow
─ TRADING ─
F4  Derivatives
F5  Backtest
─ SYSTEM ─
F6  Alerts
F7  Settings

(footer)
● UPLINK 14ms
● 12 ALERTS ARMED
● 3 STREAMS
```

- Section headers: `— SECTION —`, 9px, `--dim`, top border
- Items: 5px 10px padding, hover sets `--bg-2` + `--fg`
- Key column: 14px wide, 9px, `--dim` (active: amber)
- F1–F7 keyboard shortcuts switch tabs (preventDefault)

### 4. Market Pulse Stats Row

Six tiles in a 6-col grid with 1px `--line` gaps. Each tile:
- Label (9px uppercase --mid)
- Value (18px mono --fg-1)
- Delta (10px mono, green/red/amber per metric)
- Sub line (10px --mid)

Tiles: Total Market Cap · Volume 24h · BTC Dominance · Active Assets · Fear & Greed · Session

### 5. Price Chart (c-8, 360px row)

- Header: `▸ <SYMBOL> · USD`, asset `<select>`, timeframe segmented control `1H / 24H / 7D / 30D / 1Y`
- Chart: SVG, padded `padL=50, padR=8, padT=12, padB=22`
- Y-axis: 5 dashed gridlines with USD labels (right-aligned, 9px mono, --mid)
- X-axis: 6 dashed gridlines with time labels (formatted by span)
- Line + area fill: green if net positive, red if net negative (`opacity: 0.08` fill)
- Live price label: rectangle at right edge with the chg color, black bold text inside
- **Tooltip on hover:**
  - Crosshair (vertical + horizontal dashed amber lines, opacity full)
  - 3px amber dot at data point
  - Floating tooltip box (border 1px amber, black bg) shows: ISO datetime (mid), price (amber, 14px), `±X% from start` (green/red)
  - Position clamps inside chart bounds

**For production:** replace this hand-rolled SVG with **TradingView Lightweight Charts** or **Recharts**. Keep the visual style (amber crosshair, terminal feel, minimal axes).

### 6. Fear & Greed Gauge (c-4, 360px row)

- Half-arc gauge (180° from -180 to 0), radius 70, center (95, 80)
- 5 segment colors: red → orange → amber → light green → green (Extreme Fear → Extreme Greed)
- Segments at opacity 0.5, separated by 1.5° gaps
- Needle: `--fg-1` line + 3px circle tip + `--bg` center cap with amber outline
- Needle angle = `-90 + (value/100)*180`
- **Big number** below gauge (38px, mono, colored by zone, negative top margin -36px to overlap arc)
- Classification label (11px uppercase, letter-spacing 0.12em)
- 7-day mini-bar history below: 7 bars with labels `7d…NOW`, fill height = `value%` of bar, amber fill

### 7. Top Movers Table (c-8, 340px row)

- Sticky header (`thead th { position: sticky; top: 0 }`)
- Columns: `# · Asset · Last · 1h% · 24h% · 7d% · Vol·24h · Mkt Cap · 7d Trend`
- All columns sortable on click — clicking same column toggles asc/desc; sort indicator `▼/▲` in amber
- Asset cell: `[ICON] SYMBOL  Name` — icon is 14×14 `--bg-3` square with first letter
- 1h/24h/7d cells colored green/red by sign
- 7d Trend: 18px sparkline, green/red by 7d sign, with subtle area fill (opacity 0.12)
- Row hover: `--bg-2` background; selected row: `rgba(255,176,0,0.08)` amber tint
- Search input top-right of header: `search asset…`, filters by name OR symbol substring
- Click row → updates Asset Inspector

### 8. Asset Inspector (c-4, 340px row)

When no row selected: centered `▮ SELECT ASSET FROM TABLE` with blinking caret.

When selected:
- Header band: SYMBOL (14px amber 600) + name (10px --mid) + `RANK #N` (right, 9px --dim)
- Big price (22px mono --fg-1) + 24h ▲/▼ delta (12px green/red)
- 2-col KV grid: Mkt Cap, Vol 24h, High 24h, Low 24h, Vol/Mcap, Circ Supply, ATH·est, ATL·est, 7d, 1h
- KV row: dashed bottom border `1px dashed --line`, k=label (9px uppercase --mid), v=value (mono)
- 48px sparkline at bottom labeled "7D Sparkline"

### 9. Live Anomaly Feed (c-5, 320px row)

Streams events. New row animates in with amber flash + slide-down.

```css
@keyframes feedIn {
  from { background: rgba(255,176,0,0.18); transform: translateY(-4px); opacity: 0; }
  to { background: transparent; transform: translateY(0); opacity: 1; }
}
```

Row layout: `60px 60px 1fr auto` grid — timestamp · tag · message · ▸ glyph

**Tags** (each has a unique tinted bg + colored border):
| Tag    | Color    | Used for                                  |
|--------|----------|-------------------------------------------|
| WHALE  | amber    | Large wallet movements                    |
| LIQ    | red      | Liquidation cascades                      |
| FLOW   | cyan     | Exchange netflows                         |
| OI     | magenta  | Open interest surges                      |
| PUMP   | green    | Sharp price + volume spikes               |
| NEWS   | grey     | Headlines                                 |

Header shows pulsing green dot · STREAMING badge + event count.

### 10. Macro Overlay (c-4, 320px row)

Two stacked sections:

**Section A — current values** (per row): `SYM | sparkline (1fr) | value | %chg`
- DXY, SPX, GLD, TNX, WTI, BTC.D
- Values tick every 4s with small random walk
- Sparkline 60 points, green/red by net direction with area fill

**Section B — BTC correlation 30d** (below):
- Bipolar bar chart centered at 0
- Bar fills outward from center (left = negative, right = positive)
- Range -1 to +1, value labeled at right (green if positive, red if negative)
- Center line: 1px `--mid` divider

### 11. Funding Rates Heatmap (c-3, 320px row)

CSS grid: `60px repeat(5, 1fr)` — asset column + 5 exchange columns (BIN/OKX/BYB/DRBT/CB)
Asset rows: BTC, ETH, SOL, BNB, XRP, DOGE, AVAX, LINK
Each cell:
- Color = `rgba(25,210,122, 0.08 + intensity*0.5)` if positive, red equivalent if negative
- Intensity = `min(|value| / 0.05, 1)`
- Text: signed % to 3 decimals, e.g., `+0.012%`
- Footer note: `▸ 8h Annualized · Negative = shorts pay`

### 12. Bottom Bar (22px)

`● READY · CMD :overview · PROFILE Macro·Default · LATENCY 14ms` ……… `F1 Help · F8 Hotkeys · ⌘K Command Palette · © CRYPTOPULSE INTEL`

### 13. Stub Screens (Markets / Fundflow / Derivatives / Backtest / Alerts / Settings)

Centered ASCII frame:
```
╔═══════════════════════╗
║  MODULE NOT INSTALLED ║
╚═══════════════════════╝
```
+ amber title + dim copy + "Press F1 to return". These should be **built out for production**.

### 14. Tweaks Panel

Floating panel (bottom-right) shown only when host activates "Tweaks" mode via `postMessage`. Single control: **Type System** radio (Mono / Sans). Persists via host `__edit_mode_set_keys` protocol. **Drop this in production** — it's a prototyping affordance.

---

## Interactions & Behavior

| Interaction                                  | Behavior                                                                        |
|----------------------------------------------|---------------------------------------------------------------------------------|
| F1–F7 keys                                   | Switch nav tabs                                                                 |
| Nav item click                               | Switch active screen                                                            |
| Click asset symbol `<select>` over chart     | Load that asset's chart history                                                 |
| Timeframe button (1H/24H/7D/30D/1Y)          | Refetch chart with that range                                                   |
| Hover chart                                  | Show crosshair + tooltip with timestamp, price, %chg-from-start                 |
| Click table column header                    | Sort by that column; click same → toggle direction                              |
| Type in search input                         | Live-filter table by name/symbol substring                                      |
| Click table row                              | Select asset → updates Asset Inspector + highlights row                         |
| New anomaly event                            | Insert at top with amber flash + slide-down animation (0.4s)                    |
| Macro values                                 | Tick every 4s with small random walk; sparkline scrolls left                    |
| Funding rates                                | Refresh every 7s                                                                |

---

## State Management

### Top-level state (move to Zustand / Redux / React Query in production)

| State              | Type                          | Source                                              |
|--------------------|-------------------------------|-----------------------------------------------------|
| `active`           | `'overview' \| 'markets' …`   | Local (nav tab)                                     |
| `now`              | `Date`                        | `setInterval(setNow, 1000)`                         |
| `global`           | CoinGecko global response     | `GET /api/v3/global` every 60s                      |
| `coins`            | Top 20 markets w/ sparklines  | `GET /api/v3/coins/markets?per_page=20&sparkline=true&price_change_percentage=1h,24h,7d` every 60s |
| `fg`               | `{ value, classification, history[7] }` | `GET https://api.alternative.me/fng/?limit=7` every 5min |
| `chartData`        | `[[ts, price], …]`            | `GET /api/v3/coins/<id>/market_chart?days=<N>`      |
| `chartCoin`        | `string` (coin id)            | Local                                               |
| `tf`               | `'1H'\|'24H'\|'7D'\|'30D'\|'1Y'` | Local                                            |
| `activeCoinId`     | `string`                      | Local (table selection)                             |
| `query`            | `string`                      | Local (table search)                                |
| `feed`             | `Anomaly[]` capped at 50      | Synthesized every 3.5s (replace with real source)   |
| `apiStatus`        | `'connecting'\|'live'\|'stale'\|'offline'` | Derived from fetch outcome                |
| `macro`            | `{ sym, value, chg, series[60], corr }[]`  | Synthesized every 4s                  |
| `funding`          | `{ sym, rates[5] }[]`         | Synthesized every 7s                                |

### Caching / fetching strategy for production

- Replace inline `fetch()` + `setInterval` with **TanStack Query** (`useQuery` w/ `refetchInterval`)
- Add `staleTime` so tab-switch doesn't re-hit the API
- Add an **Anomaly WebSocket** if you have a backend (CoinGecko free has no WS) — synthesizing client-side is fine for MVP

---

## API Contracts

### CoinGecko (used in prototype, no key required, rate-limited)

```ts
// GET https://api.coingecko.com/api/v3/global
type Global = {
  data: {
    total_market_cap: { usd: number };
    total_volume: { usd: number };
    market_cap_percentage: { btc: number; eth: number; [k:string]: number };
    market_cap_change_percentage_24h_usd: number;
    active_cryptocurrencies: number;
  };
};

// GET /api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=1h,24h,7d
type Coin = {
  id: string;
  symbol: string;            // lowercase
  name: string;
  market_cap_rank: number;
  current_price: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  circulating_supply: number;
  price_change_percentage_1h_in_currency: number;
  price_change_percentage_24h_in_currency: number;
  price_change_percentage_7d_in_currency: number;
  sparkline_in_7d: { price: number[] };
};

// GET /api/v3/coins/<id>/market_chart?vs_currency=usd&days=<N>
type MarketChart = {
  prices: [timestamp: number, price: number][];
};
```

### Alternative.me Fear & Greed

```ts
// GET https://api.alternative.me/fng/?limit=7
type FngResp = {
  data: {
    value: string;                  // "64"
    value_classification: string;   // "Greed"
    timestamp: string;
  }[];
};
```

### Internal types (synthesized in prototype — replace with backend WS)

```ts
type Anomaly = {
  id: string;
  ts: Date;
  tag: 'WHALE' | 'LIQ' | 'FLOW' | 'OI' | 'PUMP' | 'NEWS';
  text: string;
};

type MacroSeries = {
  sym: 'DXY' | 'SPX' | 'GLD' | 'TNX' | 'WTI' | 'BTC.D';
  value: number;
  chg: number;       // % vs window start
  series: number[];  // 60 points
  corr: number;      // -1..+1, BTC 30d correlation
};

type FundingRow = {
  sym: string;       // 'BTC', 'ETH', …
  rates: number[];   // 5 exchanges, decimal (0.001 = 0.1%)
};
```

For real funding/OI data: **Binance** `/fapi/v1/premiumIndex`, **Bybit** `/v5/market/funding/history`, etc. Aggregate server-side.

---

## Recommended Production Stack

```
Vite + React 18 + TypeScript
├── @tanstack/react-query        # data fetching & cache
├── zustand                       # ui state (nav, selection, search)
├── tailwindcss                   # design tokens
├── lightweight-charts            # TradingView, MIT — replace PriceChart
├── lucide-react                  # icons (sparingly — terminal aesthetic uses ▸ ▮ ● glyphs)
└── socket.io-client              # if you have a backend WS
```

### Suggested file structure

```
src/
├── app/
│   └── App.tsx
├── components/
│   ├── shell/
│   │   ├── StatusBar.tsx
│   │   ├── TickerTape.tsx
│   │   ├── Nav.tsx
│   │   └── BottomBar.tsx
│   ├── panels/
│   │   ├── Panel.tsx           # generic panel-header + panel-body wrapper
│   │   ├── MarketPulse.tsx
│   │   ├── PriceChart.tsx
│   │   ├── FearGreedGauge.tsx
│   │   ├── MoversTable.tsx
│   │   ├── AssetInspector.tsx
│   │   ├── AnomalyFeed.tsx
│   │   ├── MacroOverlay.tsx
│   │   └── FundingHeatmap.tsx
│   └── primitives/
│       ├── Sparkline.tsx
│       ├── SegControl.tsx
│       └── Search.tsx
├── hooks/
│   ├── useGlobal.ts            # react-query wrappers
│   ├── useMarkets.ts
│   ├── useFearGreed.ts
│   ├── useChart.ts
│   └── useAnomalyFeed.ts
├── lib/
│   ├── api/coingecko.ts
│   ├── api/alternative.ts
│   ├── format.ts               # fmt.usd, fmt.pct, fmt.compact
│   └── types.ts
└── styles/
    ├── tokens.css              # all CSS variables
    └── globals.css
```

### Tailwind theme additions

```js
// tailwind.config.js — extend with the design tokens
extend: {
  colors: {
    bg:    { DEFAULT: '#07090b', 1: '#0b0e12', 2: '#10141a', 3: '#161b22' },
    line:  { DEFAULT: '#1d242d', 2: '#2a323c' },
    fg:    { DEFAULT: '#c8d1dc', 1: '#e6edf5', mid: '#7d8a99', dim: '#4b5563' },
    amber: { DEFAULT: '#ffb000', dim: '#8a5f00' },
    up:    { DEFAULT: '#19d27a', dim: '#0a6b3d' },
    down:  { DEFAULT: '#ff4d5e', dim: '#7a1f29' },
    cyan:  '#44c8ff',
    magenta: '#ff5cf3',
  },
  fontFamily: {
    mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
    sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
  },
  borderRadius: { DEFAULT: '0' }, // sharp corners everywhere
}
```

---

## Format Helpers (port verbatim)

See `cryptopulse.jsx` `fmt` object — `usd`, `num`, `pct`, `compact`, `time`, `date`. These handle the K/M/B/T compaction, signed percentages, ISO time slicing.

---

## What's NOT done — work for the implementer

1. **Markets / Fundflow / Derivatives / Backtest / Alerts / Settings screens** — currently stubs
2. **Real anomaly source** — currently synthesized client-side
3. **Real macro data** — DXY/SPX/Gold need a TradFi API (Polygon.io, Tiingo, FMP, Alpaca)
4. **Real funding rates** — wire Binance/Bybit/OKX
5. **Auth & persistence** — saved watchlists, alert rules, workspace layout
6. **Command palette (⌘K)** — Bloomberg-style command line `BTC <GO>` was scoped out
7. **Ask Claude assistant panel** — could use the Anthropic API server-side
8. **Multi-asset chart overlay** + drawing tools (proper trader feature)
9. **Drag-resizable panels** + saved workspace layouts
10. **Keyboard shortcuts beyond F1–F7** (`/` for search focus, `j/k` for table nav, etc.)

---

## Files in This Bundle

| File | Role |
|------|------|
| `CryptoPulse Terminal.html` | Prototype shell — all CSS tokens, layout, fonts. The CSS in `<style>` is the **source of truth for design tokens**. |
| `cryptopulse.jsx`            | All React components + state + API calls. Port to TypeScript modules. |
| `tweaks-panel.jsx`           | Prototyping convenience for the Mono/Sans toggle — drop in production. |

---

## Assets

No raster assets. All visuals are CSS, SVG, or text glyphs (▸ ▮ ● ▲ ▼ ◆ ╔ ═ ║ ╚). Fonts via Google Fonts CDN (load locally or self-host in production for performance / privacy).

No company branding from external products. The "CRYPTOPULSE" wordmark and ◆ glyph are original to this design.
