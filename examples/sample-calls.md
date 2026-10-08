# Sample conversations (copy-paste)

Nine flows that show what the server is good at. Each one is **user asks → agent calls → user gets**. Prices below are examples from testing, not live quotes - always open the product URL before buying.

---

## 1. "Best Samsung phone under 100 million Toman"

User:

> بهترین گوشی سامسونگ زیر ۱۰۰ میلیون چیه؟

Agent calls:

```json
{ "tool": "brand_lookup", "arguments": { "query": "سامسونگ" } }
{ "tool": "find_best_value", "arguments": { "query": "گوشی موبایل", "brand_ids": [18], "budget_toman": 100000000, "limit": 3 } }
```

User gets: **2-3 ranked picks** with price, discount, rating, product URL and a one-line *why* for each - plus, for the **top pick**, its **seller grade** (عالی / خیلی خوب / ...) with `top_pick_seller_source` saying where that grade came from, and the warranty. If the budget fits nothing, the response says so and suggests raising it.

Why this tool: plain search only sees **one page** - `find_best_value` walks the cheapest pages until the budget is exhausted, then ranks by rating and discount. Note the two calls: a brand word in `query` is **not** a filter, because the pages it walks are price-sorted - the brand id from `brand_lookup` is what keeps every pick on brand.

---

## 2. "Is this laptop any good?"

User:

> لپ‌تاپ ایسوس مدل X خوبه؟ نظر خریدارها چیه؟

Agent calls:

```json
{ "tool": "product_details", "arguments": { "id": 12345678, "include_comments": 3 } }
{ "tool": "product_reviews", "arguments": { "id": 12345678, "buyer_only": true, "min_rate": 4, "limit": 5 } }
```

User gets: **price, seller + warranty, rating, key specs**, then **what convinced buyers** (4-5 star verified reviews) - not the complaints first.

---

## 3. "Which of these two?"

User:

> بین این دو تا لپ‌تاپ کدوم؟ `111` یا `222`؟

Agent calls:

```json
{ "tool": "compare_products", "arguments": { "ids": [111, 222] } }
```

User gets: **price spread, ratings, warranties side by side** plus **only the specs that actually differ** - identical rows are dropped, so the answer fits in one screen.

---

## 4. "What is on deal today?"

User:

> امروز چی تخفیف خورده؟

Agent calls:

```json
{ "tool": "incredible_offers", "arguments": { "limit": 10, "min_discount": 20 } }
```

User gets: today's **شگفت‌انگیز + other promotions** with discount percents. Stock on deals moves fast - open the URL quickly.

---

## 5. "Something like this, but cheaper"

User:

> شبیه این هدفون چی هست؟ ارزون‌تر باشه بهتره.

Agent calls:

```json
{ "tool": "similar_products", "arguments": { "id": 12345678, "limit": 10 } }
{ "tool": "search_digikala", "arguments": { "query": "هدفون بی سیم", "sort": "cheapest", "limit": 5 } }
```

User gets: **Digikala's own recommendations** for that product, then the **cheapest matches** for the same query - pick from either list.

---

## 6. "Is now a good time to buy?"

User:

> قیمت این گوشی پایین‌تر هم میاد؟ الان بخرم؟

Agent calls:

```json
{ "tool": "product_price_chart", "arguments": { "id": 12345678 } }
{ "tool": "product_questions", "arguments": { "id": 12345678, "limit": 5 } }
```

User gets: **today's price vs the cheapest point in the window** (with which seller sold it cheap), plus **what other buyers asked** - enough to decide now vs later.

---

## 7. "Which colour is cheapest? What brands exist?"

User:

> همین گوشی با رنگ دیگه ارزون‌تر نیست؟ برندهای دیگه‌ش چیا هستن؟

Agent calls:

```json
{ "tool": "product_variants", "arguments": { "id": 12345678 } }
{ "tool": "search_filters", "arguments": { "query": "گوشی" } }
```

User gets: **every colour/size with its own price, seller and warranty** (often cheaper than the default card price), plus the **brand ids to narrow the search** and the real price range.

---

## 8. "Search for this weird thing"

User:

> قندانور ذغالی افغانی داری؟

Agent calls:

```json
{ "tool": "search_digikala", "arguments": { "query": "قندانور ذغالی افغانی", "limit": 5 } }
```

User gets: either real matches, or an honest "nothing actually matched" - the response carries **`low_confidence: true` + `unmatched_terms`** when Digikala's fuzzy search padded the page with partially-related items, so the agent says "I couldn't find that" instead of confidently showing a book for a sugar-bowl query.

---

## 9. "Who else sells this phone, and are they reliable?"

User:

> همین گوشی رو کجاها می‌فروشن؟ همه‌شون مطمئنن؟ ارزون‌ترینش کیه؟

Agent calls:

```json
{ "tool": "product_sellers", "arguments": { "id": 12345678 } }
{ "tool": "product_variants", "arguments": { "id": 12345678 } }
```

User gets: **every storefront behind that product, cheapest offer first** - with Digikala's own grade, trust flags and performance percentages for each (commitment, no-return, on-time shipping) - plus the per-colour/seller variant prices and, for the cheapest offer, its insurance, delivery providers and instalment/club-points extras when Digikala ships them.

---

## Tips

- Vague wording first goes to **`digikala_suggest`** - it turns slang into real search terms plus a `category_id`.
- **Always link the product URL** in whatever you show the user. Prices and stock move constantly.
- Tool results are **capped** (default 10, max 30) to protect agent context - ask for more only when needed.
