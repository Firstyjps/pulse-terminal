# ADR-003: JSONL (not SQLite) for alerts persistence

**Status:** accepted · 2026-04-28
**Decision-makers:** project owner · orchestrator session

## Context

`apps/alerts` runs `scanAnomalies()` on cron (default every 15 min), produces 0–10 findings per scan, persists them so:
1. `apps/web/app/api/backtest/route.ts` can compute hit-rate from history
2. Future tooling (LLM-graded backtest, mobile push deduplication) has a queryable record

Two storage candidates:

| | JSONL append | SQLite (better-sqlite3) |
|--|------------|------------------------|
| Setup | zero | npm install + native build |
| Read API | `readFile` + `split('\n')` | SQL |
| Write API | `appendFile` | prepared statement |
| Concurrency | single writer (cron), many short readers — no locking issue | WAL mode handles it |
| Queryability | filter/map in JS | indexed SQL |
| Footprint at current cadence | ~500KB / 14 days | ~1MB / 14 days (overhead) |
| Dependencies | none | `better-sqlite3` (~5MB native bin per platform) |
| Editable by hand | yes — text file | no — binary |

## Decision

**JSONL until clear pain emerges.**

File: `apps/alerts/data/alerts.jsonl` (gitignored)
Format: one JSON object per line, newline-delimited, append-only.

```jsonl
{"ts":"2026-04-28T22:00:00Z","scan_id":"...","symbol":"BTCUSDT","findings":[...],"marker":{"btcPrice":76821,"ethPrice":2312},"sent_webhook":true}
```

## Consequences

### Positive
- **Zero setup** — works on a fresh machine without compilation
- **Cross-platform** — no native binary headaches (Win/Mac/Linux all just work)
- **Trivial backup** — `cp alerts.jsonl alerts.bak.jsonl`
- **Hand-editable** — fix a typo, remove a bogus scan, add a manual marker — all with a text editor
- **Easy migration later** — `cat alerts.jsonl | sqlite3 ... .import` is one line

### Negative
- **Full-file scan for queries** — every backtest run reads the whole log
- **No concurrent writers** — if a second worker ever needs to write, races
- **No indexed lookups** — "all 'high' findings between X and Y" is O(n)

## Migration triggers (move to SQLite when ANY of these hits)

1. **Log file > 50MB** — at current cadence (~33KB/day), this is ~25 years. Practically never.
2. **Need joins / aggregations** beyond `findings.filter(...).reduce(...)` (e.g. correlate signals across timeframes)
3. **Multiple writers** — e.g. live MCP also writes signals → need WAL-mode concurrency
4. **Indexed queries needed** — backtest grows from "scan all" to "scan range" and full-scan latency exceeds 500ms

If none of those have hit in 6 months: keep JSONL forever.

## Migration recipe (when triggered)

```sql
CREATE TABLE scans (
  scan_id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  symbol TEXT NOT NULL,
  marker_btc REAL,
  marker_eth REAL,
  sent_webhook INTEGER
);
CREATE INDEX idx_scans_ts ON scans(ts);

CREATE TABLE findings (
  scan_id TEXT REFERENCES scans(scan_id),
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  signal TEXT NOT NULL,
  evidence_json TEXT
);
CREATE INDEX idx_findings_severity ON findings(severity);
CREATE INDEX idx_findings_category ON findings(category);
```

Then a one-shot script: `node scripts/migrate-jsonl-to-sqlite.mjs apps/alerts/data/alerts.jsonl apps/alerts/data/alerts.sqlite` — keep both for 30 days, then drop the JSONL.
