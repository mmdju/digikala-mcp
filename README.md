# digikala-mcp

[![CI](https://github.com/mmdju/digikala-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/mmdju/digikala-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![MCP](https://img.shields.io/badge/MCP-server-6E56CF)](https://modelcontextprotocol.io)

**Digikala for AI agents.** Search, compare and price-check products on Iran's largest
marketplace from any MCP client (Cline, Cursor, Claude Desktop...). Read-only, **no API key
needed**, 10 focused tools, and responses measured in kilobytes instead of megabytes.

```jsonc
// Local (stdio) - Cline / Cursor / Claude Desktop
{
  "mcpServers": {
    "digikala": { "command": "node", "args": ["D:\\path\\to\\digikala-mcp\\dist\\index.js"] }
  }
}

// OR remote - nothing to install, works from any MCP client
{
  "mcpServers": { "digikala": { "url": "https://digikala-mcp.mmdju.workers.dev/mcp" } }
}
```

## Why this exists

Digikala's public web API is undocumented, and two things make a naive wrapper useless:

1. **One search page is ~700KB** (a category page ~350KB, the deals page ~1.5MB). Most of it is
tracking blobs, SEO text and widget wrappers. Pasting that into an agent's context burns the
window and buries the answer. This server projects every response down to compact cards:
price in Toman, discount, rating, stock, seller, badges, URL - **~5KB for 20 products**.
2. **The CDN throttles with a cookie, not a 429.** When Digikala's edge wants to slow you down it
answers `307` pointing at the *same URL* with `Set-Cookie: digicdn_cookie=...` and an empty HTML
body. Any cookie-less client (including Node's `fetch`) follows that redirect into itself and
dies with `redirect count exceeded`. `src/http.ts` solves the challenge and caches the cookie.

Add Persian-specific handling on top: Arabic/Persian yeh and kaf folding, Arabic-Indic digits, and
the three ways Iranians write compound words - an empty result triggers one retry with the other
spellings, and `query_used` reports what actually matched.

## Tools

| Tool | Answers | Notes |
|---|---|---|
| `digikala_suggest` | vague wording to real search terms, category ids, trends | call first to get a `category_id` |
| `search_digikala` | "show me X", price checks | filters + sorting + paging |
| `browse_category` | "browse mobile phones" | returns sub-categories to drill into |
| `product_details` | everything about one product | specs capped at 60 attrs, narrowable |
| `product_reviews` | "is it any good?" | buyer-only and min-rating filters |
| `compare_products` | "which of these 3?" | only the specs that actually differ |
| `find_best_value` | "best X under Y toman" | scans price-sorted pages, grades the seller |
| `incredible_offers` | "what is on deal today?" | شگفت‌انگیز + other promotions |
| `best_selling` | "what is popular in Iran?" | includes category ids to go deeper |
| `similar_products` | "what else is like this?" | Digikala's own recommendations |

Every tool is read-only (`readOnlyHint: true`) and needs no credentials.

## Run it

```bash
npm install
npm run build
node dist/index.js          # stdio (what MCP clients spawn)
npm run serve               # Streamable HTTP on :3000/mcp  (+ /health)
npm test                    # unit tests, offline
npm run test:live           # live smoke test over every tool (~40s)
npm run probe               # prints endpoints, sizes and JSON shapes
```
Remote (Cloudflare Workers) — **deployed and verified**:

```bash
npm run deploy        # npx wrangler deploy
```

| | |
|---|---|
| Endpoint | `https://digikala-mcp.mmdju.workers.dev/mcp` (stateless `POST /mcp`, no auth) |
| Health | `GET /health` → `{"ok":true,"service":"digikala-mcp"}` |
| Landing | `GET /` → short Persian description page |
| Upload | 698 KiB / 142 KiB gzip, 36 ms startup |

Cloudflare's edge **can** reach `api.digikala.com`: a live `tools/call` for `search_digikala`
returned 200 with real data in ~3.1s from the deployed Worker, Persian text and all, so the
`digicdn_cookie` handshake works from a foreign IP too. The in-memory cache is per-isolate there,
which only affects how often Digikala is called, never correctness.

## Design notes

**Pacing.** Requests are serialized with a 500ms gap (`MIN_GAP_MS`), and the cookie challenge is
solved on demand. A burst is what invites the throttle in the first place, so parallel tool calls
queue instead of racing.

**Price filters are client-side.** Verified live: `/v1/search/` ignores `price_min`, `price_max`,
`has_discount` and `only_incredible`, while `sort`, `page`, `category_id`, `has_ready_to_shipment`,
`has_ship_by_seller`, `seller_types[0]` and `brands[i]` all work. So `max_price_toman` filters the
fetched page and quietly switches the sort to *cheapest* — that is what makes a budget meaningful.
Responses say so via `filters_applied_to_this_page` instead of pretending the filter was global.

**Ratings.** Digikala scores 0-100. Below 10 reviews a score is noise, so `rating_stars` is `null`
rather than a confident-looking 5.0 built from two votes.

**Out-of-stock products** come back with `default_variant` as an empty *array*, while marketable
ones use an object with `.price` on it — both shapes appear in the same payload, so the projection
layer normalises them and hides out-of-stock items by default.

**Persian search fallback.** Compound words are written three ways (لپ تاپ / لپتاپ / لپتاپ) and
Digikala indexes only some of them. An empty result triggers one retry with the other spellings
before reporting "no results"; `query_used` shows what actually matched.

**Cache.** 10 min for searches, 30 min for products/categories, 5 min for deals, 6 h for
suggestions and reviews, with in-flight request coalescing so two identical questions cost one call.

## Limitations

- Digikala's public API is **undocumented and can change without notice**. `npm run probe` prints
  every endpoint it uses, so a break is a five-minute diagnosis rather than a mystery.
- `pager.total_items` is Digikala's **fuzzy estimate** (it drifts between pages); fields are named
  `total_items_estimate` for that reason.
- Prices, stock and discounts move constantly. Every response carries the attribution string —
  keep the product URL in whatever you show the user so they can confirm before buying.
- Discount history / price charts are **not available** (`/v1/product/{id}/price-history/` is 404),
  so this server cannot answer "was it cheaper last month?".
- Not affiliated with or endorsed by Digikala.
- Cloudflare egress to `api.digikala.com` is **verified working** (see the deployment table above),
  so the hosted endpoint is as good as the local one — just slower on a cold isolate.

## Project layout

```
src/config.ts     endpoints, pacing, cache TTLs, attribution
src/http.ts       serialized fetch + digicdn_cookie challenge + retries + actionable errors
src/normalize.ts  Persian folding, Toman/Rial, star conversion, coercions
src/project.ts    raw JSON -> compact cards, specs, comments (the projection layer)
src/tools.ts      10 tools: schemas, descriptions, workflow logic
src/server.ts     shared MCP server factory (transport-agnostic)
src/index.ts      stdio + Streamable HTTP
src/worker.ts     Cloudflare Workers entry
scripts/probe-api.mjs  endpoint/shape probe (run before changing any projection)
scripts/test-client.mjs live smoke test over all 10 tools
tests/normalize.test.mjs   pure helpers: Persian folding, digits, stars, clamps
tests/projection.test.mjs  projection fixtures: marketable, out-of-stock, variant list
.github/workflows/ci.yml   build + unit tests + worker dry-run
```

## License

MIT.