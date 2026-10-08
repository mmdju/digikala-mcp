# Tool reference

Input/output reference for all **19 tools**. Types only - no internals. For conversation flows, see [examples/sample-calls.md](../examples/sample-calls.md).

Every tool is **read-only** and needs **no credentials**. Result lists are **capped** (default 10, max 30). All prices are in **Toman**.

Shared conventions:

- `limit` - how many items to return (default 10, max 30).
- `page` - 1-based page number (search pages hold 20 products). Text search serves **50 pages**, categories **100** - asking beyond returns `page_clamped: true` + `page_requested` instead of silently correcting. In practice most queries run out well before page 50 (a few hundred to ~900 results), so a page that comes back empty may simply be past the end.
- Price filters: a **ceiling** (`max_price_toman`) reaches Digikala on its own and scopes the whole market; a **floor** (`min_price_toman`) alone is answered with nothing upstream, so it only filters the fetched page. Pass both and they travel as `price[min]` / `price[max]` (`price_filter_sent_upstream: true`). `has_discount`, `min_rating` and `only_marketable` are always page-local.
- A budget also picks the sort: a ceiling sorts **cheapest** first, a floor on its own sorts **most expensive** first, so either one lands on the page it needs.
- `min_rating` (0-5) - products with too few reviews to rate honestly are **excluded**, not guessed. `rating_stars` itself is reported whatever the count (the site shows "4.7 (3)"), and such a card carries `rating_low_sample: true`; `min_rating` still refuses to act on it.
- `rating_low_sample: true` means fewer than 10 reviews. The score is real, the sample is thin.
- `only_marketable` (default true) - hides out-of-stock products. Set false to include them.
- `total_items_estimate` is **Digikala's own count**, and it drifts a little between calls. `estimate_capped: true` means the pager is on Digikala's 50-page ceiling, so the number is a floor rather than a census.

## `digikala_suggest`

Vague wording to **real search terms, category ids, trends**. Call first when you need a `category_id`, when a search returned nothing, or when the wording is colloquial.

| Param | Type | Required | Notes |
|---|---|---|---|
| `query` | string | **yes** | What the user typed, e.g. `لپ تاپ`, `گوشی سامسونگ` |
| `limit` | number | no | Max suggestions per bucket (default 10, max 25) |

Returns: `keywords`, `categories` (id + title), `trends`.

## `search_digikala`

Search products, get **compact cards**: price in Toman, discount, rating, stock, seller name, badges, product URL.

| Param | Type | Required | Notes |
|---|---|---|---|
| `query` | string | no | Persian or English, e.g. `هدفون بی سیم`, `iphone 15` |
| `category_id` | number | no | Scope to a category (from `digikala_suggest`) |
| `sort` | string | no | `relevance` · `popular` · `newest` · `best_selling` · `cheapest` · `expensive` · `fastest` · `buyers_choice` · `featured` |
| `page` | number | no | 1-based page number |
| `limit` | number | no | Default 10, max 30 |
| `min_price_toman` | number | no | Page-local on its own (a lone floor returns nothing upstream); pair it with `max_price_toman` to scope the market. **Auto-switches the sort to `expensive`** |
| `max_price_toman` | number | no | Reaches Digikala on its own and scopes the market; **auto-switches the sort to `cheapest`** |
| `min_rating` | number | no | 0-5, low-review products excluded |
| `only_marketable` | boolean | no | Default true |
| `has_discount` | boolean | no | Only `discount_percent > 0` |
| `brand_ids` | number[] | no | Up to 5 - get the ids from **`brand_lookup`** (any brand name), or **`search_filters`** for one query's brands |
| `color_ids` | number[] | no | Up to 3 - from `search_filters` `colors`. Upstream calls them `color_palettes` and honours them |
| `fast_delivery` | boolean | no | Only what Digikala ships quickly (upstream `has_jet_shipment_by_seller_or_digikala`, the site's ارسال سریع) |
| `offline_stock` | boolean | no | Only what you can buy in person in Tehran (upstream `has_offline_shop_stock`) |
| `seller_type` | string | no | `trusted` · `official` · `roosta` |
| `ready_to_ship` | boolean | no | Only Digikala-warehouse stock (fastest delivery) |
| `ship_by_seller` | boolean | no | Only products that ship from their own seller |

Budget questions (`"best X under Y"`) belong to **`find_best_value`**, not here - plain search only sees one page.

Honesty fields: Digikala's search **ORs its tokens**, so a query with no exact match still returns "relevant-ish" items. When no result contains a query word at all, the response carries `low_confidence: true` with the exact `unmatched_terms`. When every word shows up somewhere but not in the same products, `items_with_all_terms` says how many results really match - check it before quoting the page as an answer.

## `browse_category`

Browse **one category by id**, drill into sub-categories. Same compact cards as search, plus the category title and its sub-categories with ids.

| Param | Type | Required | Notes |
|---|---|---|---|
| `category_id` | number | **yes** | E.g. `11` (mobile phones). From `digikala_suggest` or `best_selling` |
| `sort` | string | no | Same 9 values as search |
| `page` | number | no | 1-based page number |
| `limit` | number | no | Default 10, max 30 |
| `min_price_toman` | number | no | Same rule as search: page-local alone, market-wide paired, **auto-switches the sort to `expensive`** |
| `max_price_toman` | number | no | Reaches Digikala on its own; **auto-switches the sort to `cheapest`**, same as search |
| `min_rating` | number | no | 0-5 |
| `only_marketable` | boolean | no | Default true |
| `has_discount` | boolean | no | Only `discount_percent > 0` (page-local) |
| `brand_ids` | number[] | no | Up to 5, sent upstream as `brands[i]` |
| `color_ids` | number[] | no | Up to 3, sent upstream as `color_palettes[i]` |
| `seller_type` | string | no | `trusted` · `official` · `roosta` |
| `ready_to_ship` / `ship_by_seller` / `fast_delivery` / `offline_stock` | boolean | no | The four on/off filters the category page offers |

Returns the cards plus `category`, `total_pages` / `total_items_estimate` and three context fields the
payload always carried: **`total_slots`** (how many product slots this page holds - a page can carry 24
slots and return 20 cards, and this is what tells the two apart), **`breadcrumb`** (every crumb with its
link, the last one being this category) and **`page_description`**. All three come back on an empty page
too, which is where they matter most: an empty answer that still says the page was full of slots is a
page worth re-reading.

One more flag: **`items_from_search: true`** appears when the category page carried no product widgets
and the cards came from a search scoped to that category instead. In that case `total_items_estimate`
describes the search, not the category - so read it only when the flag is absent.

## `browse_tag`

Digikala's **own tag shelves** (the curated collections behind `/tags/`), in two modes:

- **`query` only** - resolve a tag name to its code from the full 1000-tag list. Digikala never searches that list for us, so the matching runs here; returns `tags` (`code`, `title_fa`, `url`).
- **`code`** - walk that shelf and get the **same compact cards as `search_digikala`**, with the same filters, sorting and paging, plus the tag's own title, pager and `total_items_estimate`.

Tag pages answer with the search payload shape, so `sort`, `page` and every list filter behave exactly as they do on a search - and a budget still auto-picks the sort. With neither `code` nor `query` the call is a usage error.

One more flag, and it matters here: the shelf page is the slowest read in this server (measured 14.9s once
against ~1.5s for a search), so it is the first thing a CDN block or a 20-second timeout takes out. When
that happens the call falls back to a plain search for the shelf's name, taken from the cached tag list,
and marks the answer **`items_from_search: true`** with a `note`. Those are not the shelf's own picks -
verified live, the two lists share none of their first twenty products (2178 shelf items against 935 for
the name search) - so read the flag before trusting `total_items_estimate`, and retry later for the real
shelf. A code that is not in the tag list at all still fails with the shelf's own error: there would be
nothing to search for.

| Param | Type | Required | Notes |
|---|---|---|---|
| `code` | string | no | A tag code from an earlier call, e.g. `spongebob`. Browsing needs this |
| `query` | string | no | Tag name or part of one, e.g. `باب اسفنجی`. Used only to find codes |
| `sort` | string | no | Same values as `search_digikala` |
| `page` | number | no | 1-based page number |
| `limit` | number | no | Default 10, max 30 |
| filters | - | no | `min_price_toman`, `max_price_toman`, `min_rating`, `only_marketable`, `has_discount`, `brand_ids`, `color_ids`, `seller_type`, `ready_to_ship`, `ship_by_seller`, `fast_delivery`, `offline_stock` |

## `product_details`

**Everything about one product**: price and stock, seller name with grade and trust flags, warranty, rating, colours, grouped specifications, expert review, recent buyer comments - plus `buyer_summary`, Digikala's own one-paragraph verdict with its short lists of what buyers liked and disliked.

Three more things the product page prints and no tool used to return:

| Field | What it is |
|---|---|
| `delivery` | One row per carrier under "روش‌ها و هزینه‌های تحویل": `carrier`, `label`, `price` (as Digikala words it, e.g. `وابسته به سبد`), `free`, `arrives` (`today` / `tomorrow` / …) and a short `note`. |
| `cheaper_offer` | Present only when **another storefront** lists the same product for less: `{ price_toman, seller, saves_toman, variant_id }`. This is the site's "این کالا را … ارزان‌تر بخرید". Absent when the cheaper row is the same shop (that is just another variant). |
| `lowest_price_30d_toman` | `properties.min_price_in_last_month` - the cheapest this sold for in the last 30 days, so "is now a good price?" has an answer without calling `product_price_chart`. |
| `digiplus_services` | The DigiPlus perks the page lists, when the product has any. |

`badges` also carries the lines the site prints on the card: the urgency line ("تنها ۱ عدد در انبار باقی مانده"), free shipping, a gift and instalments.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number (from search, browse or bestsellers) |
| `spec_group` | string | no | Only this spec group, e.g. `صفحه نمایش` |
| `spec_keyword` | string | no | Only specs whose name/value contains this text, e.g. `رم` |
| `include_comments` | number | no | Recent comments to include (0-5, default 0) |
| `include_specs` | boolean | no | Default true - set **false** to omit specs and save context |

Specs are **capped at 60 attributes** unless narrowed.

## `product_price_chart`

Short **price history** for one product: daily points with price in Toman, seller and warranty per point. A **rolling window of about 30 days, not full history** - use it to say whether now is cheap or not.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number |

Returns: `current_price_toman` (read from the product itself, since the chart's series are ordered by colour and the first one is not necessarily the default), `window_days`, and one series per colour/size with its own `cheapest_in_window_toman` and `points` (`day`, `price_toman`, `seller`, `warranty`). Compare the current price against the **same** series' low - a low from another colour is a different product's price, not a discount.

## `product_questions`

**Questions buyers asked** about one product, with the answers themselves. Answers are usually there: measured over 480 live questions, 88.8% had at least one and a quarter of all answers came from the seller. Each answer carries its `from` (`seller` / `buyer` / `user`), so an official reply is never read as word of mouth, and `answer_count` is the full count when only the first two answers are shown.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number |
| `page` | number | no | 1-based page number |
| `limit` | number | no | Default 10, max 30 |

## `get_products_batch`

**Cards for up to 10 product ids in one call** - build a shortlist from search, then hand 2-5 of them to `compare_products`. Unknown ids are reported in `missing_ids`, not silently dropped.

| Param | Type | Required | Notes |
|---|---|---|---|
| `ids` | number[] | **yes** | 1 to 10 product ids |

## `product_url`

Product id to **shareable URL + title**. One cached read, not a URL guess - slugs change.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number |

## `product_variants`

**Every colour/size combo of one product** with its own price, seller, grade, warranty and stock. The card only shows the default variant, which is often **not the cheapest** - this answers "which colour is cheapest?" and "who else sells it?".

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number |

Returns: `variants` (colour, size, `price_toman`, seller + grade + trust, warranty, `lead_days`), `cheapest_variant_toman`, `default_variant_cheapest`. `best_price_last_month` is Digikala's own flag, shown as-is.

Each row also carries the offer extras **when the payload ships them** - absent, not null, on rows that have none: `insurance_title`, `insurance_premium_toman`, `insurance_covers_count`, `delivery_providers` (up to 3 carrier names), `delivery_free`, `order_limit`, `installments` (Digikala's BNPL flag), `digiclub_points` and `satisfied_percent` - Digikala's own satisfaction percentage for that offer's raters (`statistics.total_rate`, one decimal when it has one), present only while that offer has raters.

Colour and size are read from Digikala's `themes` list when present, which is where clothing keeps them - there the flat size field glues the two together (`سبز آبی - 3XL`) and this tool splits them. `cheapest_variant_toman` counts every priced variant, so check `in_stock` on the row before quoting it.

## `product_sellers`

**Every storefront selling one product**, cheapest offer first, with Digikala's own performance numbers for each: `grade`, `trusted` / `official`, `total_rate`, `commitment`, `no_return`, `on_time_shipping`, `rating_count`, `registration`, plus `offers` and `in_stock_offers`, `cheapest_toman` and the colours that seller covers.

Digikala publishes **no seller catalogue**, and its search ignores every seller-filter spelling - so this per-product view is the only way to answer "who else sells it, at what price, and how reliable are they". `cheapest_seller` / `cheapest_toman` name the top offer; the percentages are Digikala's own, for that storefront. Cheap: the same cached product read as `product_details`.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number |

## `brand_lookup`

**Any brand name to its Digikala id**, Persian or English, from the whole brand catalogue - not just the brands that appear for one query. Exact names rank before prefixes, which rank before mid-string hits; `total_in_catalogue` says how many matched before the `limit`.

Digikala's brand endpoint ignores its own search parameter, so the full list is fetched once (cached 6h) and matched here. Feed the id into `search_digikala` `brand_ids`.

| Param | Type | Required | Notes |
|---|---|---|---|
| `query` | string | **yes** | Brand name or part of one, e.g. `ایسوس`, `asus` |
| `limit` | number | no | Default 20, max 50 |

## `search_filters`

**What can be filtered for a query**: brand ids with Persian/English names, colour ids, category ids, the real price range in Toman, seller types and attribute groups (OS, storage...). Facets only, no products.

Digikala sends a query's whole brand catalogue here, not only the brands that matched - 63 brands for `گوشی موبایل`, Nokia and Motorola among them. No per-brand count arrives, so the list is alphabetical and the response says so rather than pretending to rank; `total_brands` and `brands_truncated` say when the list was cut.

| Param | Type | Required | Notes |
|---|---|---|---|
| `query` | string | **yes** | E.g. `گوشی`, `لپ تاپ` |

Feed brand ids into `search_digikala` `brand_ids` (or resolve any brand directly with `brand_lookup`), colour ids into `color_ids`, category ids into `category_id`. The response also carries **`switches`** - the on/off filters this query accepts, each with upstream's own key and title - which map to `ready_to_ship`, `ship_by_seller`, `fast_delivery` and `offline_stock`.

## `product_reviews`

Written reviews for one product, each with its rating, buyer flag and like/dislike counts, plus `advantage` / `disadvantage` points when Digikala supplied them. Re-measured 2026-10-04 over 180 reviews across all three orderings: those per-review fields usually come back empty now, so for "what do buyers like and dislike" read the `sentiment` block (or `buyer_summary` in `product_details`). Use `min_rate: 4` to see **what convinced people** rather than the complaints.

`sentiment` (when present) is Digikala's own verdict across **all** reviews: one row per topic with how many reviews mention it and the positive / neutral / negative split - the product-level answer to "what do people like and dislike". `product_details` carries the same thing as `buyer_summary`.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number |
| `sort` | string | no | `likes` (default, most useful first) · `buyers` · `newest`. |
| `page` | number | no | 1-based page number |
| `limit` | number | no | Default 10, max 30 |
| `buyer_only` | boolean | no | Only verified buyers |
| `min_rate` | number | no | Only reviews with at least this rating (1-5) |

Each review carries `rate`, `body`, `buyer`, `date`, `likes` **and `dislikes`** (the site shows both
counts on every review), `advantage` / `disadvantage` where Digikala supplied them, and `photos` - the
URLs of images the buyer attached - when there are any.

## `compare_products`

**2-5 products side by side**: price spread, rating, stock, seller grade, warranty - and **only the specs that actually differ** (identical rows are dropped). Identical twins (colour/size variants of one product) return an empty difference list with `spec_differences_note` explaining why.

| Param | Type | Required | Notes |
|---|---|---|---|
| `ids` | number[] | **yes** | 2 to 5 product ids |
| `spec_group` | string | no | Only compare specs containing this text |
| `spec_keyword` | string | no | Only compare specs whose name contains this text |

## `find_best_value`

**"Best X under Y Toman"**. Sorts by price, walks up to 3 pages until the budget is exhausted, keeps what fits, then **ranks by rating and discount** - and **grades the seller** of the top pick. The grade comes from the variant actually behind the pick; `top_pick_seller_source` names the path: `variant_match` (exact seller + price), `product_default` (Digikala's default service) or `search_card` (only the seller name is certain). Picks come from the pages that were walked, so a higher budget widens the field. A brand word in `query` is **not** a filter: the page is price-sorted, so pin the brand with `brand_ids` (id from `brand_lookup`) or the cheapest phones of any brand take the picks.

| Param | Type | Required | Notes |
|---|---|---|---|
| `query` | string | **yes** | E.g. `گوشی سامسونگ` |
| `budget_toman` | number | **yes** | Maximum price in Toman (not Rial) |
| `max_price_toman` | number | no | Alias for `budget_toman` |
| `min_rating` | number | no | 0-5 |
| `limit` | number | no | How many picks (default 3, max 10) |
| `pages` | number | no | Price-sorted pages to scan (default 1, max 3) - more pages, slower but wider |
| `brand_ids` | number[] | no | Up to 5 |
| `color_ids` | number[] | no | Up to 3, from `search_filters` |
| `seller_type` | string | no | `trusted` · `official` · `roosta` |
| `ready_to_ship` / `fast_delivery` / `offline_stock` | boolean | no | The delivery switches |

## `incredible_offers`

**Today's deals** (شگفت‌انگیز + other promotions) with discount percentages.

The feed is **one main list plus six more sections** spread over about 40 pages (~780 deals), and
the response never pretends otherwise: `sections` lists every section with how many deals it holds
right now, `total_items_estimate` / `total_pages` say how big the whole thing is, and `fetched` /
`matched_on_page` say how much of it this call looked at. Stock on deals moves fast.

One of those sections is `early_access` - the DigiPlus early-access window (دسترسی زودتر و تخفیف
بیشتر). Digikala announces it before it opens, and while it is only announced its section row
carries `teasing: true` and no deals, so an empty shelf is never reported as a scheduled window (or
the other way round).

| Param | Type | Required | Notes |
|---|---|---|---|
| `limit` | number | no | Default 10, max 30 |
| `page` | number | no | 1-based page of the chosen section (main list ≈ 40 pages) |
| `sort` | string | no | `biggest_discount` · `popular` · `newest` · `best_selling` · `cheapest` · `expensive` · `fastest` · `buyers_choice` · `featured` |
| `section` | string | no | `incredible` (default, the main list) · `running_out` · `lightening` · `fresh` · `deal_of_the_day` · `teasing` · `early_access` |
| `min_discount` | number | no | Only deals at least this percent off |
| `only_marketable` | boolean | no | Default true |
| `only_fresh` | boolean | no | Only newly added deals - upstream, so it scopes the feed |
| `min_price_toman` / `max_price_toman` | number | no | Pass **both**: they reach Digikala as a pair, otherwise they only filter this page |
| `brand_ids` | number[] | no | Up to 5, from `search_filters` |
| `seller_type` | string | no | `trusted` · `official` · `roosta` |
| `ready_to_ship` / `ship_by_seller` | boolean | no | Upstream switches |

Cards carry a **countdown** while one runs: `ends_in_seconds` (what the site ticks down) and
`ends_at` (the deadline), plus `sold_percent` when Digikala publishes it. Ordinary search cards
carry none of these. The badge still tells a real شگفت‌انگیز from an everyday discount.

## `best_selling`

**Site-wide bestseller list**, with the category ids needed to go deeper. Good fallback when a specific search finds nothing.

| Param | Type | Required | Notes |
|---|---|---|---|
| `limit` | number | no | Default 10, max 30 |
| `min_price_toman` | number | no | Page-local alone, market-wide paired |
| `max_price_toman` | number | no | Reaches Digikala on its own |
| `min_rating` | number | no | 0-5 |
| `only_marketable` | boolean | no | Default true |

`total_items_estimate` is the whole list (50 products), `total_items_scope` says so, and `fetched` is
what this call looked at - so `returned: 3` is never mistaken for "only three bestsellers exist".
All the category ids come back; if Digikala ever ships more than 30, `categories_truncated` says the
list was cut.

## `similar_products`

What Digikala recommends **alongside a given product** (کالاهای مشابه). Cheaper and better documented than guessing keywords.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number |
| `limit` | number | no | Default 10, max 30 |
| `min_price_toman` | number | no | Applied to the fetched page |
| `max_price_toman` | number | no | Applied to the fetched page |
| `min_rating` | number | no | 0-5 |
| `only_marketable` | boolean | no | Default true |
