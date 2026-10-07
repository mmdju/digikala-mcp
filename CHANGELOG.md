# Changelog

Releases of the **hosted service** (`https://digikala-mcp.mmdju.workers.dev/mcp`). Dates are UTC.

## 0.9.0 - 2026-10-07 (UTC)

- **`product_sellers`: every storefront behind one product.** Digikala publishes no seller catalogue,
  and its search ignores every seller-filter spelling (tried against the live API: `seller_ids[]`,
  `seller_id`, `seller_code` and about twenty more all answer exactly like a plain search). The
  seller block rides on every variant row, and those rows were already being fetched - one audited
  phone carried 14 rows from 8 storefronts. The new tool groups them per seller, cheapest offer
  first, with Digikala's own numbers for each: grade, trust and official flags, rating count, the
  performance percentages (commitment, no-return, on-time shipping), how long the seller has been
  registered and how many of its offers are in stock.

- **`product_variants` reports the offer block it was already carrying.** Insurance (title, premium,
  covered parts), delivery providers and free delivery, the per-order limit, instalments, Digiclub
  points and the satisfaction split across each offer's raters now travel with every variant row -
  all of them present in the payload, none of them read until now. Keys stay absent on rows whose
  payload has no such block, so an ordinary row does not gain nulls.

- **`brand_lookup`: any brand name to its id.** The brand catalogue existed upstream and no tool read
  it; `search_filters` could only show the brands of one query. The endpoint ignores its own search
  parameter (verified live: the full 574KB list arrives for any `q=`), so it is fetched once, cached
  six hours, and matched here - exact names first, then prefixes, then mid-string hits, Persian or
  English. This also corrects the docs' claim that no brand list existed anywhere.

- **`browse_tag`: Digikala's own tag shelves.** Call it with a name to resolve a tag code from the
  full 1000-tag list, then with the code to get the same compact cards as a search - same filters,
  sorting and paging. A tag page answers with the search payload shape (verified live on
  `/v1/tags/spongebob/`: 20 products, its own pager and sort options), so there is no new shape to
  trust, only a new shelf to walk.

- **The deals feed's early-access window.** The DigiPlus early-access section (دسترسی زودتر و تخفیف
  بیشتر) was the one node of the deals feed no section could reach. It is now `section:
  "early_access"`, and while Digikala is only announcing it the section row carries `teasing: true` -
  a scheduled window is never reported as an empty shelf.

- **One rate limit for everyone.** The per-IP limiter carried an exception list with a single address
  on it. The list is gone: every client spends the same budget, so the limiter is the one number that
  explains a refusal.

## 0.8.5 - 2026-10-05 (UTC)

- **A call cannot outlive the budget it promised.** Every fetch carried its own 15-second timeout and
  nothing tied it to the call's deadline, so an attempt that had already started could run its full
  timeout after the loop had run out of time: measured at 21.1 seconds against a 20-second promise in
  last night's soak, and about 16 seconds over before the loop guard existed at all. The abort signal
  is now whichever expires first - the per-fetch timeout or the remaining budget - and an abort we
  caused ourselves reports the budget as the reason instead of "could not reach Digikala". A test
  hangs a fetch and asserts the call ends in well under 3 seconds; it fails at 15 seconds without this
  change.

## 0.8.4 - 2026-10-05 (UTC)

- **Say which list you are looking at.** When a category page carries no product widgets the tool
  falls back to a search scoped to that category - and said nothing about it, so a caller could read
  search results as "page 100 of this category" while `total_items_estimate` quietly described the
  search instead. Those answers now carry `items_from_search: true`.

- **A category page now says how full it is.** `total_slots`, `breadcrumb` and the page's own
  `page_description` all sit on the same wrapper as the pager, and none of them was read: a page
  carrying 24 product slots came back with 20 cards and nothing to distinguish the two, and "where
  am I" had to be answered by the caller. All three now travel with the answer - including on the
  empty envelope, which is where they matter most: an empty page that still says it was full of
  slots is a page worth re-reading.

- **Sub-categories keep their size and their link.** `browse_category` returned only an id and a
  title, cut to 12 with no flag, so "narrow into a sub-category" came without any hint of how big
  each one was. `products_count` and the URL come back now, and the truncation is reported if it
  ever happens.

- **Reviews carry what the site shows, and a thin rating is no longer hidden.** Every review now
  reports `dislikes` alongside `likes` (the site prints both counts) and `photos`, the URLs of the
  images the buyer attached - both keys existed upstream and neither was read. `rating_stars` is
  reported whatever the review count, because the site does: a three-review product showed "4.7 (3)"
  there and `null` here. The doubt travels with the number instead of replacing it -
  `rating_low_sample: true` below 10 reviews - and `min_rating` still refuses to act on such a score,
  so a two-vote 5.0 is no more a "4 stars or better" match than it was before.

- **`product_details` answers the questions the product page answers.** It now returns `delivery`
  (every carrier with its cost wording, ETA and note - the block under "روش‌ها و هزینه‌های تحویل"),
  `cheaper_offer` when another storefront has the same product for less (the site's "این کالا را
  … ارزان‌تر بخرید"; on the audited product: another seller, 2,500,000 Toman cheaper), and
  `lowest_price_30d_toman` from `properties.min_price_in_last_month` - a free 30-day low that
  answers "was it cheaper last month?" without the price-history endpoint. `badges` grew the lines
  the site prints on the card: the urgency line, free shipping, a gift and instalments.

- **The filters the site offers are the filters this server accepts.** `color_ids` reaches Digikala
  as `color_palettes[i]` (search_filters has been handing out colour ids with nothing to feed them
  to), `fast_delivery` and `offline_stock` map onto the two delivery switches that had no parameter
  at all, and `search_filters` now returns `switches` - every on/off filter for the query, under
  upstream's own key and title. The `ready_to_ship` description claimed "fastest delivery"; the
  upstream key it sends actually means "in Digikala's warehouse".
- **A price ceiling travels on its own; a floor never claims otherwise.** `max_price_toman` alone now
  reaches Digikala (verified: laptop search and category both scope). A lone `min_price_toman` is
  still kept on the page - upstream answers it with nothing at all - and `price_filter_sent_upstream`
  finally reports false for it instead of true. A budget also picks the direction: a ceiling sorts
  cheapest first, a floor sorts most expensive first, so "everything above 200 million" no longer
  comes back empty because the page was full of the cheapest items.
- **`best_selling` stops truncating and starts counting.** It cut Digikala's 18 category ids to 12
  with no flag (six ids the description promised for drilling down simply did not exist), and gave
  no total. All of them come back now, plus `total_items_estimate` / `total_items_scope`.

- **`incredible_offers` reads the whole deals feed.** It took page 1 of one list - 20 of about 780
  deals, across 6 sections and ~40 pages - and called that "today's deals", with no total and no way
  to page. It now reports `sections` (every section with its current size), `total_items_estimate`
  and `total_pages`, accepts `page`, `sort` (nine orderings, including biggest-discount), `section`
  (the six nodes), `only_fresh`, `brand_ids`, `seller_type`, both delivery switches and a price
  pair - each one verified against the endpoint first. Cards carry the countdown the site shows:
  `ends_in_seconds`, `ends_at` and `sold_percent`.

- **`GET /mcp` stops feeding the daily budget.** That path was 99.8% of this account: 147,645
  requests on 2026-10-03 and 193,770 on 2026-10-04, against a free plan of 100,000 - which is why
  every worker on the account answered "error code: 1027". It was not crawlers. The Streamable HTTP
  transport says a server answers GET with `text/event-stream` or else 405, and answering 200 with
  HTML does not read as an error to a client: it reads as a stream that opened and immediately
  ended. The official TypeScript SDK then hands the HTML to an SSE parser that discards every line,
  and reschedules a reconnect with its attempt counter hard-coded to 0 - so `maxRetries: 2` never
  applies. One GET a second, for the life of the process; two or three open sessions accounts for
  the whole total. `GET /mcp` now answers **405** unless the client asked for `text/html`, which
  every known client treats as the expected answer (typescript-sdk: `return`, "This is an expected
  case that should not trigger an error"). The page still ships to browsers, and still links its
  four fonts from `/doran-*.woff2` instead of inlining them (283 KB -> 29 KB).
- **The cache header was not the fix, and it is worth saying so.** `cache-control: public,
  max-age=300` changed nothing: `*.workers.dev` has no zone, so there is no edge cache in front of
  the Worker - repeated requests carried no `cf-cache-status` and no `age`. The Cache API runs
  *inside* the Worker, after the invocation has already been counted, and even Workers Cache bills a
  hit as a standard request. Only Workers Static Assets are free and unlimited, and a page the
  Worker builds is not one. Any claim that a header reduces this quota is wrong.
- **An abandoned gate slot comes back on a deadline.** A `/done` that never arrived - a lost or
  hanging Durable Object RPC - used to leave a slot busy until the instance was evicted, and the
  second one did the same. The gate was fail-open in the comments and fail-closed in production;
  each slot now expires after `GATE_SLOT_TTL_MS` (40s), and reclaiming one is pacing, never a block,
  so it starts no cooldown.
- **Answers say what the page actually held.** `best_selling` and `similar_products` blamed Digikala
  when it was our own filters that emptied the page; `filterNote` reported a match count taken after
  the result limit and claimed a price bound nobody had passed; `estimate_capped` announced a
  50-page text-search cap on categories, which serve 100 (a 51-page category was flagged as capped
  when it never was). `matched_on_page` is now counted before the limit, `filters_note` only appears
  when a price bound was actually sent, and the price range is `returned_price_range_toman` - the
  range of the cards returned, not of everything that matches.
- **Category filters reach Digikala.** `browse_category` sent only `sort` and `page`, so `brand_ids`
  and a price pair were dropped in silence. It now shares the filter builder with `search_digikala`,
  and declares `brand_ids`, `seller_type`, `ready_to_ship`, `ship_by_seller` and `has_discount`
  (all verified against `/v2/category/{id}/`). Its default order is `featured` again - what the
  category page shows - instead of relevance, so page 1 is the same list the site has.
- **A call cannot outlive the budget it promised.** The 20-second blocked-call window was only
  checked at the top of the retry loop, so a call could run about 16s past it. The pacing wait and
  the fetch are both inside the window now, and the challenge resend is skipped when there is no
  time left to solve it.
- **The suite runs every tool.** `npm test` reached 2 of the 16 handlers; it now runs all 16 against
  recorded payloads, and four gates were added that the sibling projects already had: every test
  file must be registered, the instructions must name every tool, `/health` must report the shipped
  version, and `package.json` must match it. Nine tests that re-wrote production logic inside the
  test are gone - one of them asserted a cap `get_products_batch` does not have (it rejects an 11th
  id rather than slicing). `npm run fuzz` is offline for real now; it was making eight live requests
  to api.digikala.com on every push.
- **Docs corrected.** README said 81 assertions (187 tests now) and showed a `/health` body without
  `version`; README_FA said 60 requests/minute (20); SECURITY.md said the endpoint does not rate
  limit callers (it does, via the binding); architecture.md said "no database" (there is a Durable
  Object and a D1 table). The CI badge pointed at a workflow that does not exist in that repository.

## 0.8.3 - 2026-09-30

- **The blocked-call window settles at 20 seconds.** One number, spent inside a single tool call:
  the retries there are invisible to the caller, and only a call that runs past the window hears the
  message. 20 is the middle - it gives up 5s earlier than the original 25 while still covering most
  of the measured 15-30s block.

## 0.8.2 - 2026-09-30

- **The wait inside a blocked call is 15 seconds now, down from 25.** The design is unchanged - the
  retry happens inside the same tool call, so the caller sees nothing until there is data or the
  window runs out - and the window is shorter: a call that is going to fail says so about ten
  seconds sooner. The price is giving up on the blocks that run to the long end of the measured
  15-30s window. The one message a caller gets is unchanged.

## 0.8.1 - 2026-09-30

- **The per-IP limit on POST /mcp is 20 requests per minute now** (was 60). This number is abuse
  protection, not a Digikala budget - the gate is what keeps the service's own calls to the CDN at
  two in flight, half a second apart - and at 60 a single client could take half the service-wide
  line on its own. A full agent session (handshake, a search, a few detail reads, one comparison)
  still fits inside a minute; measured, that is roughly 15-20 POSTs. The counter is Cloudflare's and
  per data centre, so one IP gets a fresh budget at each location, and the trusted-IP list is
  untouched.

## 0.8.0 - 2026-09-30

Reliability work on the way this service talks to Digikala, measured against the live CDN before
anything was written: two parallel requests are fine, six trip the cookie challenge, a block lasts
15-30 seconds from the burst that invites it, and the old code quit on one at ~18s.

**A block is now a wait, not a failure**

- **Retries are bounded by time, not by an attempt count.** A blocked-class failure (cookie
  challenge, 429, HTML bot page) gets a 25s wall-clock window with the same 2s / 4s / 8s backoff
  inside it. Short blocks turn into real answers instead of errors, and no wait overshoots the
  window. The message asks for 15-30 seconds rather than a minute.
- **Failures are recorded for real.** The D1 log looked for a global `executionCtx` that Workers does
  not have, so the insert was cancelled the moment the response went out - four confirmed blocks in
  testing, zero rows. The handler takes the execution context and registers the write with
  `waitUntil`.

**One line for the whole service**

- **Every upstream call asks a global gate for a turn first** (one Durable Object instance,
  `digikala-global`). At most two calls in flight, 500ms apart - the load the CDN actually
  tolerates - and after a block the whole service cools down for 10s, then 20s, then 30s until a call
  comes back clean. Per-isolate pacing could never see the other isolates, which is exactly how
  parallel callers from different isolates still arrived together.
- **The gate is fail-open by design.** No binding, a timeout, a stub that throws or answers nonsense:
  the request goes ahead with the old per-isolate pacing. A broken gate costs latency, never a call.
  Queue waiting draws on the same 25s budget, so the gate cannot make a caller wait longer than it
  already could, and a caller whose patience runs out while queued gets its own error kind (`wait`) -
  the blocked count in D1 stays a count of real blocks.
- **A Durable Object stub belongs to the request that made it.** Running the worker locally with four
  parallel tool calls showed the first cut of this failing open on three of them ("Cannot perform I/O
  on behalf of a different request"): the gate looked wired and did nothing. It is built inside the
  request that uses it now.

Also: the retry path no longer sleeps out a backoff after the final attempt (8s of the 20.5s a 5xx
storm used to take), and CI runs on Node 22 - wrangler 4 requires it, and the old pin had been
failing every run since the wrangler bump.

## 0.7.0 - 2026-09-24

A full audit of the projection against live Digikala payloads (250+ requests straight to
`api.digikala.com`) turned up fifteen defects, several of which the tool descriptions actively
denied. Confirmed before fixing, each with the live response in hand.

**Reviews, questions and the "pros and cons" that were never missing**

- **A review's pros and cons are now returned.** They arrive as a *list* of short strings and the
  string-only `short()` turned every one of them into `null` - measured live, 95 filled values came
  back and none survived. `product_details` also gains `buyer_summary`: Digikala's own one-paragraph
  verdict plus its short lists of what buyers liked and disliked, which sat unread in the payload.
- **The default review ordering changed to most-liked.** In `newest` order Digikala strips the pros
  and cons almost every time (0 of 400 reviews, against ~12% for most-liked), so the default answer
  lost exactly what callers ask for. `newest` still works and says so.
- **`product_reviews` now carries `sentiment`** - Digikala's own aspect-level verdict across all
  reviews: one row per topic (price, battery, build) with the positive / neutral / negative split.
- **`product_questions` returns the answers.** The description claimed sellers rarely reply; measured
  over 480 live questions, 88.8% carry an answer and a quarter of all replies come from the seller,
  often with the one fact a shopper cannot get anywhere else. Each answer now carries its
  `from` (seller / buyer / user) so an official reply is never read as word of mouth.

**Filters that did not filter**

- **A price range now reaches Digikala.** `/v1/search/` honours `price[min]` / `price[max]`, not the
  `price_min` / `price_max` this server was sending - so every budget answer was one page of twenty
  products presented as the market. Both bounds must be set; a lone `price[min]` returns nothing.
  `price_filter_sent_upstream` says which of the two happened.
- **Category scoping works.** A bare `category_id` is ignored outright - even a nonsense one returned
  the entire 6.2-million catalogue, so a caller that asked for one category got everything with no
  warning. It goes out as `categories[0]` now, which also fixes the `browse_category` fallback that
  could return the whole catalogue.
- **Category 22 is not mobile phones** (it is storage hardware; mobile is 11). The wrong id was in
  the tool schema, the docs and a "verified live" comment.

**Stock and variants**

- **A missing stock count no longer reads as an empty shelf.** `marketable_stock` is usually absent
  rather than zero - 56 of 62 variants on one t-shirt - and treating absence as zero reported a fully
  buyable product as sold out. Only an explicit 0, a blocking status or a missing price means "no".
- **Clothing colour and size are separate again.** They live in `themes[]`, not in `color` / `size`,
  and the flat size field glues the two together (`سبز آبی - 3XL`).

**Honesty fixes**

- **Price charts no longer invent a variant id or a current price.** The series carry a 0-based
  index (reported as `chart_index`, never `variant_id`) and are ordered by colour, so the first
  series was not the current price - off by 10 million Toman on one laptop. The real current price
  comes from the product payload now, and each series reports its own window low, since a low from
  another colour is a different price.
- **A removed product errors instead of answering.** `/v2/product/1/` returns
  `{"product":{"is_inactive":true}}` - truthy, so the guard let it through and the response invented
  a product with id 0 and an empty title.
- **`low_confidence` stops firing on every Latin query.** The comparison was case-sensitive while
  `faFold` never lower-cases, so `galaxy s25` was flagged unmatched while 18 of 20 titles carried
  both words. It also reports `items_with_all_terms` so a page that is mostly partial matches is
  visible without being called a failure.
- **`search_filters` stops dropping the main brands.** Digikala sends a query's whole brand
  catalogue and no per-brand count, so the list is alphabetical and the 30-brand cut threw away
  Samsung. The limit went up and the cut is now reported via `total_brands` / `brands_truncated`.
- **`estimate_capped` keys off the 50-page ceiling** rather than a near-1000 count, which left
  several capped queries unflagged while the number was really a ceiling.

## 0.6.4 - 2026-09-23

- **Upstream blocks now fail fast instead of timing out the client.** Blocked-class retries (cookie challenge, 429, HTML bot pages) dropped from 5 to 2 - the old budget could hold a tool call past a minute while the MCP client gave up silently. The error text now says to retry in about a minute and that the failure was recorded.
- **Temporary upstream-failure log (D1).** Blocked / network / 5xx failures write one best-effort row (tool, kind, status, path, product id - no queries, no IPs) so repeated timeouts can be diagnosed without user reports. Rows older than 30 days are pruned. Usage errors are never logged.

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
