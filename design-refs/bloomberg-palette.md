# Bloomberg Terminal Palette — extracted from claude.ai/design

> Source: user-provided Claude Design screenshot of "CryptoPulse Terminal"
> Use as a reference for the `[data-theme="bloomberg"]` CSS override block in `globals.css`.
> **NOT a replacement for Phosphor** — it lives alongside as opt-in.

## Substrate (background)

| Token | Hex | Usage |
|---|---|---|
| `--bb-bg-0` | `#000000` | Page substrate (pure black, NOT blue-tinted) |
| `--bb-bg-1` | `#0a0a0a` | Dim panel surfaces |
| `--bb-bg-2` | `#111111` | Card/cell surfaces |
| `--bb-bg-3` | `#1a1a1a` | Hot/active rows on hover |

## Brand & accent (the Bloomberg amber)

| Token | Hex | Usage |
|---|---|---|
| `--bb-amber` | `#ff9500` | Primary brand (CRYPTOPULSE wordmark, F1-F7 keys, primary metric values) |
| `--bb-amber-bright` | `#ffb340` | Header text on hover/focus, emphasis |
| `--bb-amber-dim` | `#cc7a00` | Secondary amber labels |
| `--bb-yellow` | `#ffd700` | Status bar (FEED OFFLINE, DATE, SESSION badges) |

## Signal (price + delta)

| Token | Hex | Usage |
|---|---|---|
| `--bb-up` | `#22c55e` | Bullish %, green sparklines |
| `--bb-down` | `#ef4444` | Bearish %, red sparklines, chart line |
| `--bb-neutral` | `#888888` | Flat / 0% delta |

## Foreground (text scale)

| Token | Hex | Usage |
|---|---|---|
| `--bb-txt-1` | `#e5e5e5` | Primary text (price, labels) |
| `--bb-txt-2` | `#a0a0a0` | Secondary labels (24H, MKT CAP headers) |
| `--bb-txt-3` | `#666666` | Meta (timestamps, "tracked across feeds") |
| `--bb-txt-4` | `#3a3a3a` | Disabled / hint |

## Borders

| Token | Hex | Usage |
|---|---|---|
| `--bb-line` | `rgba(255,149,0,0.08)` | Default capillary border (amber-tinted) |
| `--bb-line-2` | `rgba(255,149,0,0.18)` | Active panel border, F-key hover |
| `--bb-line-3` | `rgba(255,149,0,0.35)` | Selected nav item, focused cell |

## Typography

- **All text mono** — `'JetBrains Mono', 'IBM Plex Mono', 'Courier New', monospace`
- **Headers**: UPPERCASE, letter-spacing `0.08em`, weight 600
- **Numbers**: tabular-nums, weight 500
- **No body sans** in Bloomberg theme — terminal uniformity

## Layout signature

- Top header bar: `CRYPTOPULSE / VER X.X.X / USR ANALYST / DESK MACRO·INTEL` left, `FEED OFFLINE / UTC HH:MM:SS / DATE / SESSION` right
- Below: live ticker bar with 10 assets (BTC ETH USDT SOL BNB XRP DOGE ADA AVAX LINK)
- Left rail: `F1 OVERVIEW / F2 MARKETS / F3 FUNDFLOW / F4 DERIVATIVES / F5 BACKTEST / F6 ALERTS / F7 SETTINGS`
- Section headers prefixed with `▸` and uppercase: `▸ MARKET PULSE` `▸ TOP MOVERS` `▸ LIVE ANOMALY FEED`
- Status bar bottom: `▸ READY · CMD :OVERVIEW · PROFILE MACRO·DEFAULT · LATENCY 14MS`
- 2px corners (no rounding), `rgba(255,149,0,0.08)` capillary borders

## Differences vs Phosphor Substrate

| Aspect | Phosphor | Bloomberg |
|---|---|---|
| Substrate | `#02030a` (blue-black) | `#000000` (pure black) |
| Brand color | `#41ff8b` (phosphor green) | `#ff9500` (amber) |
| Borders | `rgba(255,255,255,0.08)` (neutral) | `rgba(255,149,0,0.08)` (amber-tinted) |
| Body font | Inter (sans) | JetBrains Mono everywhere |
| Status bar | Optional | Always-on bottom rail |
| F-key nav | None | Always-visible left rail |
