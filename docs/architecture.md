# Architecture

How a question becomes an answer. No user data is stored anywhere in this path.

```mermaid
flowchart LR
    subgraph you [Your machine]
        agent[AI agent<br/>Cline / Cursor / Claude]
    end
    subgraph cf [Cloudflare Workers]
        worker[digikala-mcp<br/>stateless, no database]
    end
    dk[(Digikala public web API<br/>api.digikala.com)]

    agent -->|POST /mcp<br/>Streamable HTTP, no key| worker
    worker -->|HTTPS + polite pacing<br/>reads only| dk
    dk -->|compact JSON| worker
    worker -->|small cards<br/>toman, rating, URL| agent
```

What this means:

- **Stateless.** Every request stands alone - no sessions, no accounts, nothing to log in to.
- **Read-only.** All 16 tools carry `readOnlyHint`. Nothing here can change, delete or order anything.
- **No user data.** Nothing about *you* is stored. The only memory is (a) a short-lived response cache - minutes, shared across the edge location so one fetch serves every nearby instance - and (b) Digikala's own CDN bot-check cookie (10-minute TTL), so one solved challenge spares every instance. Prices, stock and discounts are re-read from Digikala every time the cache expires.
- **Rate-limit aware.** Requests are paced half a second apart, and throttles (Digikala's cookie challenge or HTTP 429) ride out an exponential, jittered backoff - list tools can also return partial results (`partial_failures`, `partial_scan_note`) instead of failing whole calls.
- **Undocumented upstream.** Digikala's public API can change without notice - this service tracks it and adapts, which is exactly why the [verify script](scripts/verify-live.mjs) exists.

Verify it yourself: `node scripts/verify-live.mjs` (needs node 18+, nothing to install).
