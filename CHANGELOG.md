# Changelog

Releases of the **hosted service** (`https://digikala-mcp.mmdju.workers.dev/mcp`). Dates are UTC.

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
