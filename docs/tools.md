# Tool reference

Input/output reference for all **16 tools**. Types only - no internals. For conversation flows, see [examples/sample-calls.md](../examples/sample-calls.md).

Every tool is **read-only** and needs **no credentials**. Result lists are **capped** (default 10, max 30). All prices are in **Toman**.

Shared conventions:

- `limit` - how many items to return (default 10, max 30).
- `page` - 1-based page number (search pages hold 20 products).
- Price filters (`min_price_toman`, `max_price_toman`) and `has_discount` are **applied to the fetched page** - Digikala's own API ignores them, so pass a budget with `sort: cheapest` to see the global cheapest.
- `min_rating` (0-5) - products with too few reviews to rate honestly are **excluded**, not guessed.
- `only_marketable` (default true) - hides out-of-stock products. Set false to include them.

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
| `min_price_toman` | number | no | Applied to the fetched page |
| `max_price_toman` | number | no | Applied to the fetched page - **auto-switches sort to `cheapest`** |
| `min_rating` | number | no | 0-5, low-review products excluded |
| `only_marketable` | boolean | no | Default true |
| `has_discount` | boolean | no | Only `discount_percent > 0` |
| `brand_ids` | number[] | no | Up to 5 - get the ids from **`search_filters`** (no brand list exists anywhere else) |
| `seller_type` | string | no | `trusted` · `official` · `roosta` |
| `ready_to_ship` | boolean | no | Only Digikala-warehouse stock (fastest delivery) |
| `ship_by_seller` | boolean | no | Only products that ship from their own seller |

Budget questions (`"best X under Y"`) belong to **`find_best_value`**, not here - plain search only sees one page.

## `browse_category`

Browse **one category by id**, drill into sub-categories. Same compact cards as search, plus the category title and its sub-categories with ids.

| Param | Type | Required | Notes |
|---|---|---|---|
| `category_id` | number | **yes** | E.g. `22` (mobile). From `digikala_suggest` or `best_selling` |
| `sort` | string | no | Same 9 values as search |
| `page` | number | no | 1-based page number |
| `limit` | number | no | Default 10, max 30 |
| `min_price_toman` | number | no | Applied to the fetched page |
| `max_price_toman` | number | no | Applied to the fetched page |
| `min_rating` | number | no | 0-5 |
| `only_marketable` | boolean | no | Default true |

## `product_details`

**Everything about one product**: price and stock, seller name with grade and trust flags, warranty, rating, colours, grouped specifications, expert review, recent buyer comments.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number (from search, browse or bestsellers) |
| `spec_group` | string | no | Only this spec group, e.g. `صفحه نمایش` |
| `spec_keyword` | string | no | Only specs whose name/value contains this text, e.g. `رم` |
| `include_comments` | number | no | Recent comments to include (0-5, default 0) |
| `include_specs` | boolean | no | Default true - set **false** to omit specs and save context |

Specs are **capped at 60 attributes** unless narrowed.

## `product_price_chart`

Short **price history** for one product: daily points with price in Toman, seller and warranty per point. A **rolling window of about a week, not full history** - use it to say whether now is cheap or not.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number |

Returns: `current_price_toman`, `cheapest_in_window_toman`, `window_days`, per-variant `points` (`day`, `price_toman`, `seller`, `warranty`).

## `product_questions`

**Questions buyers asked** about one product. Answers are often empty (sellers rarely reply), so this returns questions with their `answer_count` - not guessed answers.

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

## `search_filters`

## `search_filters`

**What can be filtered for a query**: brand ids with Persian/English names, colour ids, category ids, the real price range in Toman, seller types and attribute groups (OS, storage...). Facets only, no products.

| Param | Type | Required | Notes |
|---|---|---|---|
| `query` | string | **yes** | E.g. `گوشی`, `لپ تاپ` |

Feed brand ids into `search_digikala` `brand_ids`, category ids into `category_id`. Price/colour filtering on search stays client-side.

## `product_reviews`

Written reviews for one product. Use `min_rate: 4` to see **what convinced people** rather than the complaints.

| Param | Type | Required | Notes |
|---|---|---|---|
| `id` | number | **yes** | The dkp- number |
| `sort` | string | no | `newest` (default) · `buyers` · `likes` |
| `page` | number | no | 1-based page number |
| `limit` | number | no | Default 10, max 30 |
| `buyer_only` | boolean | no | Only verified buyers |
| `min_rate` | number | no | Only reviews with at least this rating (1-5) |

## `compare_products`

**2-5 products side by side**: price spread, rating, stock, seller grade, warranty - and **only the specs that actually differ** (identical rows are dropped).

| Param | Type | Required | Notes |
|---|---|---|---|
| `ids` | number[] | **yes** | 2 to 5 product ids |
| `spec_group` | string | no | Only compare specs containing this text |
| `spec_keyword` | string | no | Only compare specs whose name contains this text |

## `find_best_value`

**"Best X under Y Toman"**. Sorts by price, walks up to 3 pages until the budget is exhausted, keeps what fits, then **ranks by rating and discount** - and **grades the seller** of the top pick.

| Param | Type | Required | Notes |
|---|---|---|---|
| `query` | string | **yes** | E.g. `گوشی سامسونگ` |
| `budget_toman` | number | **yes** | Maximum price in Toman (not Rial) |
| `max_price_toman` | number | no | Alias for `budget_toman` |
| `min_rating` | number | no | 0-5 |
| `limit` | number | no | How many picks (default 3, max 10) |
| `pages` | number | no | Price-sorted pages to scan (default 1, max 3) - more pages, slower but wider |
| `brand_ids` | number[] | no | Up to 5 |
| `seller_type` | string | no | `trusted` · `official` · `roosta` |
| `ready_to_ship` | boolean | no | Only Digikala-warehouse stock |

## `incredible_offers`

**Today's deals** (شگفت‌انگیز + other promotions) with discount percentages. Each card keeps its badge - a real شگفت‌انگیز deal vs an everyday discount.

| Param | Type | Required | Notes |
|---|---|---|---|
| `limit` | number | no | Default 10, max 30 |
| `min_discount` | number | no | Only deals at least this percent off |
| `only_marketable` | boolean | no | Default true |

Stock on deals moves fast.

## `best_selling`

**Site-wide bestseller list**, with the category ids needed to go deeper. Good fallback when a specific search finds nothing.

| Param | Type | Required | Notes |
|---|---|---|---|
| `limit` | number | no | Default 10, max 30 |
| `min_price_toman` | number | no | Applied to the fetched page |
| `max_price_toman` | number | no | Applied to the fetched page |
| `min_rating` | number | no | 0-5 |
| `only_marketable` | boolean | no | Default true |

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
