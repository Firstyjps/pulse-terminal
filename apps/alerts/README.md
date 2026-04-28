# @pulse/alerts

Background worker that runs anomaly detection on a schedule and persists every signal to a JSON-lines log. Optional webhook fires on each new high-severity finding.

## Run
```bash
pnpm --filter @pulse/alerts dev
```

## Env
| Var | Purpose | Default |
|-----|---------|---------|
| `ALERT_INTERVAL_MS`   | How often to scan | `240000` (4 min) |
| `ALERT_LOG_PATH`      | JSONL file to append findings | `./data/alerts.jsonl` |
| `ALERT_WEBHOOK_URL`   | POST endpoint for high-severity findings (Discord/Slack/etc.) | _unset = stdout only_ |
| `ALERT_MIN_SEVERITY`  | `low` \| `med` \| `high` | `med` |
| `ALERT_FUNDING_SYMBOL`| Symbol passed to `detect_anomalies` | `BTCUSDT` |

## Output format
Each line of the JSONL log is one anomaly scan result:
```json
{"ts":"2026-04-28T...","scan_id":"...","findings":[...],"sent_webhook":true}
```

## Backtest tie-in
`apps/web/app/api/backtest/route.ts` reads this same JSONL file to compute hit-rate.
