# ETF Flows — Operator Guide

Real-time spot BTC/ETH ETF flow data backs `/api/flows/etf`, the Overview page, the Fundflow page, and the `get_etf_flows` MCP tool.

## Source priority (auto-fallback)

1. **Coinglass v4 OpenAPI** — if `COINGLASS_API_KEY` is set. Paid (Hobbyist tier, $29/mo).
2. **Farside.co.uk via curl-impersonate** — free, real data, Cloudflare-protected source.
3. **Synthesized proxy** — green/red mock that flags `_isProxy: true` so the UI shows a banner.

The adapter lives at [packages/sources/src/etf.ts](../packages/sources/src/etf.ts); the Farside scraper at [packages/sources/src/farside.ts](../packages/sources/src/farside.ts).

## Why curl-impersonate

`farside.co.uk` is fronted by Cloudflare. Default `curl` and Node `fetch` get an HTTP 403 "Just a moment..." challenge page from Hetzner's IP space — Cloudflare flags datacenter ranges. Real Chrome's TLS handshake (JA3/JA4 fingerprint) is allowed through.

[curl-impersonate](https://github.com/lwthiker/curl-impersonate) is a fork of curl that mimics Chrome's TLS+HTTP/2 fingerprint exactly. With `curl_chrome116`, the same request returns 200 + 14KB of real data.

## Install on the Hetzner server

Already provisioned at `~deploy/bin/curl_chrome116` on the prod box. To reinstall (or set up a fresh server):

```bash
mkdir -p ~/bin && cd ~/bin
curl -sSL -o curl-impersonate.tar.gz \
  "https://github.com/lwthiker/curl-impersonate/releases/download/v0.6.1/curl-impersonate-v0.6.1.x86_64-linux-gnu.tar.gz"
tar xzf curl-impersonate.tar.gz
chmod +x curl_chrome116
~/bin/curl_chrome116 -sSL "https://farside.co.uk/btc/" | grep -c tabletext   # → ≥250 means working
```

The adapter auto-discovers `~/bin/curl_chrome116` at runtime. To override (e.g. system-wide install, different version):

```bash
echo "FARSIDE_CURL=/usr/local/bin/curl_chrome119" >> ~/pulse-terminal/.env.local
pm2 restart pulse-web
```

## Verify it's working

```bash
curl -s "https://cryptopulse.buzz/api/flows/etf" | jq '._isProxy, .flows[-3:]'
```

Should print `false` (not proxy) and 3 recent dated rows.

If it prints `true`: the Farside fallback failed, the adapter dropped to proxy. Check:

1. `~/bin/curl_chrome116` exists + executable
2. Hand-test it against farside: `~/bin/curl_chrome116 -sSL https://farside.co.uk/btc/ | head`
3. `pm2 logs pulse-web --err --lines 20 --nostream` — look for `farside`-tagged messages

## Local dev (Windows / macOS)

curl-impersonate releases include macOS arm64/x64 builds; Windows requires WSL or just use the Coinglass key path. The adapter degrades to the proxy gracefully, so dev still loads with mock data.

## Refresh cadence

- Farside HTML scrape: 10 min revalidate (`packages/sources/src/etf.ts` `revalidate: 600`)
- Coinglass: same 10 min revalidate
- Cron pre-warm: handled implicitly by the snapshot poller in `apps/realtime`

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `_isProxy: true` after recent deploy | curl-impersonate not on prod box | install per "Install" section |
| Random 403 spike from Farside | Cloudflare bumped challenge level | wait 24h, often clears; or rotate `FARSIDE_CURL` to `curl_chrome119` |
| Empty `flows[]` despite 200 | Farside HTML structure changed | check `parseTable()` regex in `farside.ts` against the new HTML |
| Adapter timeout on every call | Hetzner CPU throttling under load | check `pm2 logs`, consider raising `--max-time` from 20s |
