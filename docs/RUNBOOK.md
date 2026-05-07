# Pulse Terminal Runbook

## Deploy

```bash
cd /home/deploy/pulse-terminal
git pull --ff-only origin master
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pm2 restart ecosystem.config.cjs --update-env
pm2 save
node scripts/pulse-status.mjs
pnpm pulse:smoke
```

## Rollback

```bash
cd /home/deploy/pulse-terminal
git log --oneline -5
git reset --hard <known-good-commit>
pnpm install --frozen-lockfile
pnpm build
pm2 restart ecosystem.config.cjs --update-env
pm2 save
node scripts/pulse-status.mjs
pnpm pulse:smoke
```

## Env Changes

1. Edit `.env.local` or the PM2 `env` block.
2. Restart with `pm2 restart ecosystem.config.cjs --update-env`.
3. Run `node scripts/pulse-status.mjs`.
4. Run `pnpm pulse:smoke`.

Never paste `pm2 jlist` raw output into chat or tickets; it can include env values.

## Fire-Test Targets

- `GET /api/health` must not be `unhealthy`; `core.status` must be `healthy`.
- `GET /api/alerts/recent?limit=1` should return `configured:true` in production.
- `GET /api/portfolio/aggregate` should return `configured:true` when portfolio keys are set.
- `GET /api/depth?symbol=BTCUSDT` must return non-empty bids and asks.
- `GET /api/dual-assets/settings` must include `minTrackAprPct:55`, `aprAlertPct:100`, and `authRequiredForTracking:false`.
- `GET /api/dual-assets/snapshots?coin_pair=SOL-USDT&duration=8h&limit=100` must not return rows below `apr_pct:55`.
- `GET /api/dual-assets/snapshots?coin_pair=SOL-USDT&duration=1d&limit=100` must not return rows below `apr_pct:55`.
- `GET /api/dual-assets/summary?coin_pair=SOL-USDT&duration=8h,1d&days=30` must return direction/duration-separated summary rows.
- `GET http://127.0.0.1:8081/regime` must return a regime and score.

## Admin Token

`POST /api/snapshot/history/clear` is disabled unless `PULSE_ADMIN_TOKEN` is set.
Use a long random token, restart PM2 with `--update-env`, and keep the value out
of logs.
