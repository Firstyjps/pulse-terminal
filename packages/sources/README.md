# @pulse/sources

Every external data adapter lives here. **Apps must import from this package — never `fetch()` directly.**
Owned by **Role 3 (Sources Agent)** in [../../AGENTS.md](../../AGENTS.md).

## Public API
```ts
// market
getOverview()
getStablecoins()
getETFFlows({ days? })
getTVL()
getDexVolume()
getMarketSnapshot(n)

// derivatives
getFundingRates({ exchange?, symbol? })
getOpenInterest({ exchange?, symbol? })
getFutures()

// helpers
fetchWithRetry(url, opts?)
withFallback(primary, ...fallbacks)
```

Every public function implements a fallback chain (CoinGecko → CoinCap → cache).
