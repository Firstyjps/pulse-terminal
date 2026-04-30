# Pulse Terminal · Desktop (Tauri 2.x)

Native desktop wrapper around the Next.js web app. The Tauri shell adds:

- Window chrome with `◆ Pulse Terminal` title and 1400×900 default size
- System tray icon with **Show/Hide · Refresh · Quit** menu
- Click-to-toggle behavior on the tray icon
- Close-button hides to tray instead of quitting (typical desktop-app UX)
- Native notifications via `tauri-plugin-notification`

The web app itself runs fine standalone — Tauri is purely an optional shell.

## Prerequisites

| | macOS | Windows | Linux |
|---|---|---|---|
| Rust toolchain | `brew install rustup-init && rustup-init` | https://rustup.rs (run rustup-init.exe) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| OS deps | Xcode CLT | Microsoft C++ Build Tools + WebView2 | `apt install libwebkit2gtk-4.1-dev libssl-dev …` |
| Tauri CLI | `cargo install tauri-cli --version "^2.0"` | same | same |

(Full prerequisites: https://tauri.app/start/prerequisites/)

## Icons

You will need to generate platform-specific icons before the first build. Easiest path:

```bash
cargo install tauri-cli --version "^2.0"
# from monorepo root, run once with any 1024×1024 PNG:
cargo tauri icon path/to/source.png
```

This populates `src-tauri/icons/` with all required sizes (`32x32.png`, `128x128.png`,
`128x128@2x.png`, `icon.icns`, `icon.ico`).

## Run dev

From the monorepo root:

```bash
cargo tauri dev
```

This:

1. Runs `pnpm --filter @pulse/web dev` → boots Next.js on http://localhost:3000
2. Opens a Tauri window pointing at that dev server
3. Hot-reloads when you edit web code

## Build distributables

```bash
cargo tauri build
```

Outputs to `src-tauri/target/release/bundle/`:

- **Windows**: `.msi` installer
- **macOS**: `.dmg` disk image (and `.app` bundle)
- **Linux**: `.deb` + `.AppImage`

## Notes

- The Cargo `target/` directory is gitignored — it's ~3-5 GB.
- The web app reads `window.__TAURI__` to detect the desktop runtime; you can wire native notifications via the Tauri JS API in any `apps/web/` component when this is set.
- For prod releases, set `build.frontendDist` to an SSG export rather than the dev server, or run a sidecar Next server inside Tauri.
