# Digikala MCP - Shop intelligence for AI agents

![Digikala MCP banner](assets/digikala-mcp.png)

A public MCP server that gives AI agents **real Digikala knowledge**: search, **prices in Toman**, discounts, ratings, sellers, reviews, deals and bestsellers. **Read-only, no key needed.**

**Live endpoint:** `https://digikala-mcp.mmdju.workers.dev/mcp` (Streamable HTTP, stateless)

**[نسخه فارسی](README_FA.md)** · **[Examples](examples/sample-calls.md)** · **[Tool reference](docs/tools.md)** · **[Changelog](CHANGELOG.md)**

## Connect in 30 seconds

Any MCP client, **one URL**. Cline / Cursor / Claude Desktop (`mcp.json` style):

```json
{
  "mcpServers": {
    "digikala": { "url": "https://digikala-mcp.mmdju.workers.dev/mcp" }
  }
}
```

Then just talk: **"best Samsung phone under 20 million Toman"**, **"is this laptop any good?"**, **"what is on deal today?"**, **"what is popular in Iran right now?"**.

## 14 tools

| Tool | What it answers |
|---|---|
| `digikala_suggest` | Vague wording to **real search terms, category ids, trends** |
| `search_digikala` | "Show me X", price checks, filters + sorting + paging |
| `browse_category` | Browse a category, **drill into sub-categories** |
| `product_details` | Everything about one product: **price, seller, warranty, specs, reviews** |
| `product_price_chart` | "Is now cheap?" - **short price history with seller per point** |
| `product_questions` | "What did buyers ask?" - questions + answer counts |
| `get_products_batch` | Shortlist cards for **up to 10 ids** - feeds `compare_products` |
| `product_url` | Product id to **shareable URL** + title |
| `product_reviews` | "Is it any good?" - **buyer-only** and min-rating filters |
| `compare_products` | "Which of these?" - **only the specs that actually differ** |
| `find_best_value` | "Best X under Y Toman" - **ranked picks with seller grade** |
| `incredible_offers` | **Today's deals** (شگفت‌انگیز + other promotions) |
| `best_selling` | Site-wide bestsellers, with category ids to go deeper |
| `similar_products` | "What else is like this?" - Digikala's own recommendations |

Notes for agent builders:

- **All prices are in Toman** (1 Toman = 10 Rial). Prices, stock and discounts **move constantly** - always link the product URL so the user can confirm before buying.
- Start vague queries with **`digikala_suggest`** to get real search terms and a `category_id`.
- Anything with a **budget** or the word **"best"** goes to **`find_best_value`** - plain search only sees one page.
- Product counts are **Digikala's own estimates** and drift between pages - treat them as approximate.
- Results are **capped** (default 10, max 30) to protect agent context. Specs are capped at 60 attributes unless narrowed.
- See **[examples/sample-calls.md](examples/sample-calls.md)** for five copy-paste conversation flows, and **[docs/tools.md](docs/tools.md)** for the full parameter reference.

## Data source

Digikala's public web API (**undocumented, may change without notice**). This project is **not affiliated with or endorsed by Digikala**.

## Status

**Free public service** on Cloudflare Workers. **Fair use applies** - if you hammer it, you will be rate-limited.

## License

Showcase repository (**docs only, no source published**) - see [LICENSE](LICENSE). Security notes in [SECURITY.md](SECURITY.md). Persian version in [README_FA.md](README_FA.md).
