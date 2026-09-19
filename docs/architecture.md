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
- **No user data.** Nothing about you is stored. What the server does keep: a short-lived response cache (a few minutes) and Digikala's own CDN bot-check cookie (10 minutes), so one solved challenge covers every instance. Prices, stock and discounts are re-read from Digikala every time the cache expires.
- **Rate-limit aware.** Requests go out half a second apart. When Digikala pushes back - its cookie challenge or a 429 - the server waits it out with exponential backoff and a bit of randomness, instead of retrying in a burst.
- **Undocumented upstream.** Digikala's public API can change without notice - this service tracks it and adapts, which is exactly why the [verify script](scripts/verify-live.mjs) exists.

Verify it yourself: `node scripts/verify-live.mjs` (needs node 18+, nothing to install).
