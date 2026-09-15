// Spins up the server over stdio and exercises every tool against the live
// API. Run: npm test  (takes ~40s: requests are paced deliberately)
//
// Output is kept ASCII-only on purpose: PowerShell redirects and terminals
// mangle Persian, and a smoke test that cannot be read is not a smoke test.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js"] });
const client = new Client({ name: "mcp-smoke", version: "0.1.0" }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("TOOLS(" + tools.length + "):", tools.map((t) => t.name).join(", "));

let firstId = null;
let secondId = null;

async function call(name, args) {
  const started = Date.now();
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text || "";
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* error text, not JSON */
  }
  const ms = Date.now() - started;
  const summary = [];
  if (parsed) {
    if (Array.isArray(parsed.items)) summary.push(`items=${parsed.items.length}`);
    if (Array.isArray(parsed.picks)) summary.push(`picks=${parsed.picks.length}`);
    if (Array.isArray(parsed.products)) summary.push(`products=${parsed.products.length}`);
    if (parsed.total_items_estimate !== undefined) summary.push(`total~${parsed.total_items_estimate}`);
    if (parsed.price_range_toman) summary.push(`price=${parsed.price_range_toman.min}..${parsed.price_range_toman.max}`);
    if (parsed.specs_attribute_count !== undefined) summary.push(`specs=${parsed.specs_attribute_count}`);
    if (parsed.spec_differences_total !== undefined) summary.push(`specdiff=${parsed.spec_differences_total}`);
    if (parsed.in_budget !== undefined) summary.push(`inBudget=${parsed.in_budget}`);
    if (parsed.top_pick_seller) summary.push(`sellerGrade=${parsed.top_pick_seller.grade ?? "?"}`);
    if (Array.isArray(parsed.picks) && parsed.picks.length) summary.push(`why=${parsed.picks[0].why?.length ?? 0}`);
    if (parsed.returned !== undefined && !summary.some((s) => s.startsWith("items="))) summary.push(`returned=${parsed.returned}`);
    if (parsed.message) summary.push("message");
  } else {
    summary.push(text.slice(0, 90).replace(/\s+/g, " "));
  }
  console.log(`--- ${name} ${JSON.stringify(args)} isError=${!!res.isError} ${ms}ms ${summary.join(" ")}`);
  return parsed;
}

const s1 = await call("digikala_suggest", { query: "لپ تاپ", limit: 3 });
if (Array.isArray(s1?.categories) && s1.categories.length) {
  console.log("    suggest category:", JSON.stringify(s1.categories[0]));
}

const r1 = await call("search_digikala", { query: "لپ تاپ", limit: 3 });
firstId = r1?.items?.[0]?.id ?? null;
secondId = r1?.items?.[1]?.id ?? null;
console.log("    first id:", firstId, "| url:", r1?.items?.[0]?.url ? "present" : "MISSING");

await call("search_digikala", { query: "لپ تاپ", max_price_toman: 30000000, min_rating: 3, limit: 3 });
await call("search_digikala", { query: "zzzznotathing", limit: 2 }); // empty path
await call("browse_category", { category_id: 22, limit: 3 });
await call("incredible_offers", { limit: 3, min_discount: 10 });
await call("best_selling", { limit: 3 });

if (firstId) {
  await call("product_details", { id: firstId, spec_keyword: "رم", include_comments: 2 });
  await call("product_reviews", { id: firstId, limit: 3, buyer_only: true });
  await call("similar_products", { id: firstId, limit: 3 });
  if (secondId) await call("compare_products", { ids: [firstId, secondId] });
  await call("product_details", { id: 999999999 }); // dead id -> actionable error
}

// A budget that actually fits something (cheapest laptops start ~63M Toman),
// so the ranking + seller-grading path runs, then one that cannot fit.
await call("find_best_value", { query: "لپ تاپ", budget_toman: 75000000, limit: 3 });
await call("find_best_value", { query: "لپ تاپ", budget_toman: 25000000, limit: 3 });
await call("search_digikala", { query: "لپ تاپ", sort: "bogus_sort" }); // usage error

await client.close();
console.log("SMOKE-DONE");