# Changelog

Releases of the **hosted service** (`https://digikala-mcp.mmdju.workers.dev/mcp`). Dates are UTC.

## 0.6.3 - 2026-09-21

- **Real rate limit: 60 requests per minute per IP** on POST /mcp, enforced with Cloudflare's Rate Limiting binding - HTTP 429 with `retry-after: 60` when exceeded. The 0.6.0 limiter was removed in 0.6.1 for honest reasons: its counter lived in the isolate, so every isolate had its own budget and no single client ever hit it (measured: 150 requests/minute, zero 429s). The binding's counter is shared across the whole edge location, so the limit finally means what it says - with the same per-location caveat: one IP gets a fresh 60 at each data centre. Normal use never notices; floods don't get far either, but this is abuse protection, not a global quota. Live-verified: a 200-request burst drew 94×200 / 106×429, with clean recovery after the window.
- The limiter **fails open**: local runs (`npm run serve`, `wrangler dev`) have no binding and proceed unthrottled, and a throwing limiter never blocks a request - abuse protection must not become an availability dependency.
- Fix: `/health` and the MCP handshake report the deployed version again (0.6.2 shipped with the constant still saying 0.6.1 - the release-drift check in this repo's live verify caught it).

## 0.6.2 - 2026-09-21

- **`find_best_value` no longer grades the wrong seller.** Live-tested: on two budget queries the graded storefront was absent from every pick - Digikala grades the product's *default* service, which is not always the one behind the picked price. The grade now comes from the variant carrying the pick's exact seller and price, with honest fallbacks; `top_pick_seller_source` names which path won (`variant_match`, `product_default` or `search_card` - the last means only the seller name is certain).
- **Search results now admit fuzzy matching.** Digikala's search ORs tokens across the catalogue, so a query with no exact match still returns "relevant-ish" items (a gibberish query returned a book with an estimated 999 results). When no result contains every query term, the response now carries `low_confidence: true` with the exact `unmatched_terms`, and `estimate_capped: true` when the fuzzy count hit Digikala's ceiling.
- **Clamped pages say so.** Text search serves 50 pages, categories 100; asking beyond now returns `page_clamped: true` and `page_requested` instead of silently correcting (search, category, reviews and Q&A).
- **`search_filters` brands now self-rank.** When upstream sends per-option counts, brands list as `match_count` and real matches sort first - the raw facet pads the list with zero-match brands that previously looked relevant. Without counts, the response says the ordering is unknown rather than inventing one.
- `compare_products` explains an empty difference list: identical twins produce no differences, and without a note that read as "no specs fetched".
- `page` schema descriptions now state the caps out loud.

## 0.6.1 - 2026-09-20

- **No client-side rate limit**: the per-IP request limiter is gone. It was per-isolate, so it never actually stopped a single client - measured against the live endpoint, 150 requests inside a minute drew zero 429s - while adding a failure mode of its own. What stays is the pacing on the server's *own* calls to Digikala: half a second apart, with backoff when Digikala pushes back.
- **The CDN challenge cookie moved out of KV** and into the Cache API. KV's free plan allows 1,000 writes a day and Digikala's CDN re-challenges often enough to burn it (writes ran about 1,100 a day), which took the whole service down with `KV put() limit exceeded for the day` until the quota reset at UTC midnight. The Cache API has no daily write quota, so sharing the cookie costs nothing now.
- Fix: a cookie store that cannot be read or written no longer fails a tool call - the request carries on with the cookie it already has and returns real data.

## 0.6.0 - 2026-09-20

- **Budget parity in `browse_category`**: passing `max_price_toman` / `min_price_toman` now auto-switches the sort to cheapest-first, exactly like `search_digikala` - a budget filter finally means something on category pages too.
- **Edge rate limit**: the public endpoint allows **60 requests per minute per IP** (HTTP 429 + `retry-after` when exceeded). A normal agent session never comes close, so ordinary use is unaffected - this only stops flood abuse of the service. *(Removed in 0.6.1: the counter was per-isolate and never held up under measurement.)*
- **Sharper `compare_products`**: same-titled specs from different groups (e.g. weight under dimensions vs. packaging) no longer merge into one row - differences are keyed on group + title.
- **Faster multi-product calls**: `compare_products` and `get_products_batch` now overlap upstream reads, so shortlists come back in about half the time. The polite 500ms pacing to Digikala is unchanged.
- Fix: `product_price_chart` covers a rolling window of **about 30 daily points** (was documented as "about a week").

## 0.5.0 - 2026-09-19

- **Shared response cache** across the edge location (Cloudflare Cache API): one upstream fetch now serves every server instance for popular reads like `best_selling` and `incredible_offers` - same freshness windows, far fewer calls to Digikala.
- **Browser MCP clients work**: the endpoint answers CORS preflights (`OPTIONS /mcp`) and sends CORS headers on every response.
- Every upstream request now **aborts after 15 seconds** - a hung connection becomes a retryable network error instead of an indefinite wait.
- **Partial-failure hardening**: `get_products_batch` returns the good cards with `partial_failures` when some ids hit the CDN throttle, and `find_best_value` keeps earlier-page picks and reports `partial_scan_note` when a later page throttles - a partial answer beats no answer.
- `/health` now reports the service `version`.
- Fix: `product_price_chart`'s "current price" is now the last point of the default variant, not an arbitrary number from the flattened point list.

## 0.4.1 - 2026-09-18

- The solved **CDN challenge cookie now survives server restarts** (KV-backed, 10-minute TTL): one solved challenge spares every instance, instead of every cold instance re-solving it.
- Throttles (cookie challenge, HTTP 429, HTML bot pages) now ride out an **exponential backoff with jitter** (~2s up to 32s, 5 attempts) on top of the 3 linear retries kept for network/5xx errors.

## 0.4.0 - 2026-09-16

- New tools: **`product_variants`** (every colour/size combo with its own price, seller, grade and warranty - the default card price is often not the cheapest), **`search_filters`** (brand/color/category ids, real price range, attribute groups - makes `brand_ids` actually usable).
- Search results now point at `search_filters` for filter discovery.

## 0.3.0 - 2026-09-16

- New tools: **`product_price_chart`** (short price history with seller per point), **`product_questions`** (buyer Q&A, no guessed answers), **`get_products_batch`** (cards for up to 10 ids, feeds `compare_products`).
- `compare_products` and `get_products_batch` now **skip dead ids** (`skipped_ids` / `missing_ids`) instead of failing the whole call.

## 0.2.0 - 2026-09-15

- New tool: **`product_url`** - id to shareable URL + title in one cached read.
- `price_rial` on every card, next to `price_toman`.
- `has_discount: true` on all list tools.
- `include_specs: false` on `product_details` to skip specs and save context.

## 0.1.0 - 2026-09-11

- First public release: **10 tools** - suggest, search, category, details, reviews, compare, best value, deals, bestsellers, similar (`product_url` came in 0.2.0).
- Persian handling: yeh/kaf folding, Persian digits, compound-word retry.
- Compact cards (~5KB for 20 products instead of ~700KB raw).
