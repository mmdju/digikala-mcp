# Changelog

Releases of the **hosted service** (`https://digikala-mcp.mmdju.workers.dev/mcp`). Dates are UTC.

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
