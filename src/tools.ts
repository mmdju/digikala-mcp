// One tool per user intent, compact responses, and every upstream quirk
// handled *here* instead of leaking into the agent's context.
//
// Error convention:
// - Usage errors (missing/conflicting args) -> throw UpstreamError("usage"),
//   surfaced as isError. The agent did something wrong and must know.
// - Empty results -> empty() envelope: the call worked, there is just nothing
//   to show, plus a concrete suggestion.
// - Upstream problems -> UpstreamError with an actionable message.
//
// Two upstream behaviours this file exists to absorb:
// 1. /v1/search/ ignores price_min, price_max, has_discount and
//    only_incredible (verified 2026-09-15). Price, rating and stock filtering
//    therefore happens on the fetched page, and sort:"cheapest" is how an
//    agent asks for the global cheapest.
// 2. pager.total_items is fuzzy - Digikala's estimate drifts between pages -
//    so it is reported as approximate and never as a promise.

import { ATTRIBUTION, MIN_RATING_COUNT } from "./config.js";
import { UpstreamError } from "./http.js";
import { clampLimit, clampPage, faFold, faSearchVariants, imageUrl, num, short, str } from "./normalize.js";
import {
  bestSellingRaw,
  cardsOf,
  categoryRaw,
  commentsOf,
  commentsRaw,
  empty,
  extractWidgetProducts,
  offersRaw,
  pagerOf,
  productRaw,
  searchPage,
  sellerOf,
  similarRaw,
  SORT_HELP,
  sortId,
  specsOf,
  stockCountOf,
  suggestRaw,
  toCard,
  type Card,
} from "./project.js";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const toman = (v: unknown): number | null => {
  const n = num(v, 0);
  return n > 0 ? Math.round(n) : null;
};

// Price/rating/stock filters run on the fetched page. Sorting by price first
// is what makes a budget filter meaningful, so callers are nudged that way.
function filterCards(items: Card[], a: Record<string, unknown>): Card[] {
  const min = toman(a.min_price_toman);
  const max = toman(a.max_price_toman);
  const minRating = num(a.min_rating, 0);
  const onlyMarketable = a.only_marketable !== false;
  return items.filter((c) => {
    if (onlyMarketable && !c.in_stock) return false;
    if (min !== null && (c.price_toman ?? 0) < min) return false;
    if (max !== null && (c.price_toman ?? Number.MAX_SAFE_INTEGER) > max) return false;
    if (minRating > 0) {
      // A product with too few reviews has rating_stars null: not a match for
      // "at least 4 stars", because we cannot honestly say it has them.
      if (c.rating_stars === null || c.rating_stars < minRating) return false;
    }
    return true;
  });
}

function readId(a: Record<string, unknown>, name = "id"): number {
  const id = Math.floor(num(a[name], 0));
  if (!(id > 0)) {
    throw new UpstreamError(
      `"${name}" must be a positive Digikala product id (the dkp- number). Get one from search_digikala, browse_category or best_selling first.`,
      "usage"
    );
  }
  return id;
}

function priceNote(cards: Card[]) {
  const prices = cards.map((c) => c.price_toman).filter((p): p is number => p !== null);
  if (!prices.length) return {};
  return {
    price_range_toman: { min: Math.min(...prices), max: Math.max(...prices) },
    currency: "toman",
  };
}

// ---------------------------------------------------------------- 1. suggest

async function suggestImpl(a: Record<string, unknown>) {
  const query = str(a.query).trim();
  if (!query) {
    throw new UpstreamError('"query" is required, e.g. {"query": "لپ تاپ"}.', "usage");
  }
  const limit = clampLimit(a.limit, 10, 25);
  const data = (await suggestRaw(query))?.data ?? {};
  const keywords = (Array.isArray(data.auto_complete) ? data.auto_complete : [])
    .map((x: any) => str(x?.keyword))
    .filter(Boolean)
    .slice(0, limit);
  const categories = (Array.isArray(data.categories) ? data.categories : [])
    .map((x: any) => ({
      id: num(x?.category?.id, 0) || null,
      title: faFold(x?.category?.title_fa || x?.keyword),
      keyword: str(x?.keyword) || null,
    }))
    .filter((c: any) => c.title && c.id)
    .slice(0, limit);
  const trends = (Array.isArray(data.trends) ? data.trends : [])
    .map((x: any) => faFold(x?.keyword))
    .filter(Boolean)
    .slice(0, limit);
  return {
    query,
    keywords,
    categories,
    trends,
    returned: keywords.length + categories.length,
    ...(keywords.length || categories.length
      ? {}
      : { message: `Digikala suggests nothing for '${query}'. Try a shorter, more general phrase.` }),
    attribution: ATTRIBUTION,
  };
}

// ------------------------------------------------------- shared list logic

// A budget filter only means something on a price-sorted page, so it switches
// the sort to "cheapest" unless the caller asked for something else.
function resolveSort(a: Record<string, unknown>, hasBudget: boolean) {
  const requested = str(a.sort).trim();
  if (requested) {
    const hit = sortId(requested);
    if (!hit) {
      throw new UpstreamError(`Unknown sort "${requested}". Valid values: ${SORT_HELP}.`, "usage");
    }
    return hit;
  }
  return hasBudget ? sortId("cheapest")! : sortId("relevance")!;
}

function listExtras(a: Record<string, unknown>) {
  return {
    brandIds: (Array.isArray(a.brand_ids) ? a.brand_ids : [])
      .map((x) => Math.floor(num(x, 0)))
      .filter((x) => x > 0)
      .slice(0, 5),
    readyToShip: a.ready_to_ship === true,
    shipBySeller: a.ship_by_seller === true,
    sellerType: str(a.seller_type).trim() || undefined,
  };
}

// Tells the agent which filters it asked for were applied by us rather than
// Digikala - otherwise "nothing under 5 million" reads as a fact about the
// market instead of a fact about this page.
function filterNote(a: Record<string, unknown>, fetched: number, kept: number) {
  const active: Record<string, unknown> = {};
  const min = toman(a.min_price_toman);
  const max = toman(a.max_price_toman);
  if (min !== null) active.min_price_toman = min;
  if (max !== null) active.max_price_toman = max;
  if (num(a.min_rating, 0) > 0) active.min_rating = num(a.min_rating, 0);
  if (a.only_marketable !== false) active.only_marketable = true;
  if (!Object.keys(active).length) return {};
  return {
    filters_applied_to_this_page: active,
    fetched_from_digikala: fetched,
    matched_on_page: kept,
    note:
      "Digikala's search API ignores price and discount filters, so these were applied to " +
      "the products fetched for this page. For a global answer, sort by cheapest or page through.",
  };
}

// ------------------------------------------------------------- 2. search

async function searchImpl(a: Record<string, unknown>) {
  const query = faFold(a.query);
  const categoryId = Math.floor(num(a.category_id, 0)) || undefined;
  if (!query && !categoryId) {
    throw new UpstreamError(
      'Pass "query", "category_id", or both. Example: {"query": "هدفون بی سیم", "max_price_toman": 3000000}.',
      "usage"
    );
  }
  const hasBudget = toman(a.min_price_toman) !== null || toman(a.max_price_toman) !== null;
  const sort = resolveSort(a, hasBudget);
  const page = clampPage(a.page, 50);
  const limit = clampLimit(a.limit, 10, 30);
  const data =
    (await searchPage({ query, categoryId, sort: sort.id, page, ...listExtras(a) }))?.data ?? {};
  let source = data;
  let all = cardsOf(data.products);
  // Persian compound words are written three ways ("لپ تاپ" / "لپ‌تاپ" /
  // "لپتاپ") and Digikala indexes only some of them. When a query comes back
  // empty, try the other spellings once before reporting "no results" - this
  // is the most common cause of a dead search in Persian.
  let retriedWith: string | null = null;
  if (!all.length && query) {
    for (const variant of faSearchVariants(query).slice(1)) {
      const alt =
        (await searchPage({ query: variant, categoryId, sort: sort.id, page, ...listExtras(a) }))?.data ?? {};
      if (Array.isArray(alt.products) && alt.products.length) {
        source = alt;
        all = cardsOf(alt.products);
        retriedWith = variant;
        break;
      }
    }
  }
  const items = filterCards(all, a).slice(0, limit);
  const pager = pagerOf(source);
  const related = (Array.isArray(source.related_search_words) ? source.related_search_words : [])
    .map((w: unknown) => faFold(w))
    .filter(Boolean)
    .slice(0, 8);
  const dym = data.did_you_mean;
  const didYouMean = faFold(typeof dym === "string" ? dym : dym?.text);

  if (!items.length) {
    return empty(
      `No product matched '${query || categoryId}' on page ${page} with those filters.`,
      all.length
        ? "The page did have products, so loosen the filters (raise max_price_toman, drop min_rating) or fetch another page."
        : `Digikala returned nothing for this query. Try related terms${
            related.length ? ` (${related.slice(0, 4).join("، ")})` : ""
          } or digikala_suggest.`,
      { query: query || null, sort: sort.label, page: pager.page, ...priceNote(all) }
    );
  }

  return {
    query: query || null,
    query_used: retriedWith ?? (query || null),
    category_id: categoryId ?? null,
    sort: sort.label,
    page: pager.page,
    total_pages: pager.total_pages,
    total_items_estimate: pager.total_items,
    items,
    returned: items.length,
    did_you_mean: didYouMean || null,
    related_searches: related,
    ...priceNote(items),
    currency: "toman",
    ...filterNote(a, all.length, items.length),
    attribution: ATTRIBUTION,
  };
}

// ------------------------------------------------- 3. browse a category

// The v2 category page carries richer context (breadcrumb, sub-categories) but
// buries products inside widget wrappers; if that shape ever changes, fall
// back to the search endpoint scoped by category_id, which is verified stable.
async function browseCategoryImpl(a: Record<string, unknown>) {
  const categoryId = readId(a, "category_id");
  const sort = resolveSort(a, false);
  const page = clampPage(a.page, 100);
  const limit = clampLimit(a.limit, 10, 30);
  const data = (await categoryRaw(categoryId, { sort: sort.id, page }))?.data ?? {};
  let products = extractWidgetProducts(data.widgets);
  const wrapper = (data.widgets ?? []).find((w: any) => w?.data?.pager);
  let pager = pagerOf(wrapper?.data);
  const category = (data.widgets ?? []).find((w: any) => w?.data?.category)?.data?.category ?? null;
  const subCategories = (wrapper?.data?.sub_categories_best_selling ?? [])
    .map((c: any) => ({ id: num(c?.id, 0) || null, title: faFold(c?.title_fa) }))
    .filter((c: any) => c.id)
    .slice(0, 12);

  if (!products.length) {
    const fallback = (await searchPage({ query: "", categoryId, sort: sort.id, page }))?.data ?? {};
    products = fallback.products ?? [];
    pager = pagerOf(fallback);
  }

  const items = filterCards(cardsOf(products), a).slice(0, limit);
  const categoryTitle = category ? faFold(category.title_fa) : null;

  if (!items.length) {
    return empty(
      `Category ${categoryId}${categoryTitle ? ` (${categoryTitle})` : ""} returned no products on page ${page} with those filters.`,
      subCategories.length
        ? `Narrow into a sub-category instead, e.g. category_id ${subCategories[0].id} = ${subCategories[0].title}.`
        : "Try another page, or search with a query scoped to this category.",
      { category_id: categoryId, category: categoryTitle, page: pager.page }
    );
  }

  return {
    category_id: categoryId,
    category: categoryTitle,
    sort: sort.label,
    page: pager.page,
    total_pages: pager.total_pages,
    total_items_estimate: pager.total_items,
    sub_categories: subCategories,
    items,
    returned: items.length,
    ...priceNote(items),
    currency: "toman",
    ...filterNote(a, products.length, items.length),
    attribution: ATTRIBUTION,
  };
}

// ---------------------------------------------------- 4. product details

async function productDetailsImpl(a: Record<string, unknown>) {
  const id = readId(a);
  const raw = (await productRaw(id))?.data?.product;
  if (!raw) {
    throw new UpstreamError(
      `Digikala returned no product body for id ${id}. The id may be wrong or the product removed - search for it again.`,
      "http"
    );
  }
  const card = toCard(raw);
  const variant = (Array.isArray(raw.default_variant) ? raw.default_variant[0] : raw.default_variant) ?? {};
  const layer = raw.data_layer ?? {};
  const path = [layer.item_category2, layer.item_category3, layer.item_category4, layer.item_category5]
    .map((x) => faFold(x))
    .filter(Boolean);

  const specs = specsOf(raw, {
    group: str(a.spec_group) || undefined,
    keyword: str(a.spec_keyword) || undefined,
  });
  const specCount = specs.reduce((n, g) => n + g.attributes.length, 0);
  const MAX_ATTRS = 60;
  let trimmed = specs;
  let truncated = false;
  if (specCount > MAX_ATTRS) {
    truncated = true;
    let budget = MAX_ATTRS;
    trimmed = [];
    for (const g of specs) {
      if (budget <= 0) break;
      const attrs = g.attributes.slice(0, budget);
      budget -= attrs.length;
      trimmed.push({ group: g.group, attributes: attrs });
    }
  }

  const previewCount = Math.min(Math.max(Math.floor(num(a.include_comments, 0)), 0), 5);
  const comments = commentsOf(raw.last_comments, previewCount);

  return {
    id: card.id,
    title: card.title,
    title_en: short(raw.title_en, 120),
    url: card.url,
    image: imageUrl(raw.images),
    category: faFold(raw.category?.title_fa) || null,
    category_path: path,
    brand: faFold(layer.brand) || null,
    price_toman: card.price_toman,
    price_before_toman: card.price_before_toman,
    discount_percent: card.discount_percent,
    currency: "toman",
    in_stock: card.in_stock,
    stock_count: stockCountOf(raw),
    status: str(raw.status) || null,
    warranty: faFold(variant?.warranty?.title_fa) || null,
    rating_stars: card.rating_stars,
    rating_count: card.rating_count,
    comments_count: num(raw.comments_count, 0),
    questions_count: num(raw.questions_count, 0),
    seller: sellerOf(raw),
    badges: card.badges,
    colors: (Array.isArray(raw.colors) ? raw.colors : [])
      .slice(0, 8)
      .map((c: any) => ({ title: faFold(c?.title), hex: str(c?.hex_code) || null }))
      .filter((c: any) => c.title),
    variant_count: Array.isArray(raw.variants) ? raw.variants.length : 0,
    specs: trimmed,
    specs_attribute_count: specCount,
    ...(truncated
      ? {
          specs_truncated: true,
          specs_note: `Showing ${MAX_ATTRS} of ${specCount} specifications. Narrow with spec_group (e.g. "باتری") or spec_keyword (e.g. "حافظه").`,
        }
      : {}),
    expert_review: short(raw.review?.description, 600),
    ...(comments.length ? { recent_comments: comments } : {}),
    attribution: ATTRIBUTION,
  };
}

// ---------------------------------------------------- 5. product reviews

// The comments endpoint returns reviews only - no rating histogram - so the
// response says that out loud instead of letting the agent guess.
async function productReviewsImpl(a: Record<string, unknown>) {
  const id = readId(a);
  const allowed: Record<string, string> = {
    newest: "جدیدترین",
    buyers: "دیدگاه خریداران",
    likes: "مفیدترین",
  };
  const sort = str(a.sort).trim().toLowerCase() || "newest";
  if (!allowed[sort]) {
    throw new UpstreamError(
      `Unknown sort "${sort}". Valid values: ${Object.keys(allowed).join(", ")}.`,
      "usage"
    );
  }
  const page = clampPage(a.page, 50);
  const limit = clampLimit(a.limit, 10, 30);
  const data = (await commentsRaw(id, { sort, page }))?.data ?? {};
  const all = Array.isArray(data.comments) ? data.comments : [];
  const buyerOnly = a.buyer_only === true;
  const minRate = num(a.min_rate, 0);
  const picked = all.filter((c: any) => {
    if (buyerOnly && c?.is_buyer !== true) return false;
    if (minRate > 0 && num(c?.rate, 0) < minRate) return false;
    return true;
  });
  const pager = pagerOf(data);
  const items = commentsOf(picked, limit);

  if (!items.length) {
    return empty(
      `No review of product ${id} matched on page ${page}${buyerOnly ? " (buyer reviews only)" : ""}.`,
      all.length
        ? "The page did have reviews, so drop buyer_only or min_rate, or fetch another page."
        : "This product has no written reviews yet. product_details still returns the rating and comments_count.",
      { id, page: pager.page, total_pages: pager.total_pages, total_items_estimate: pager.total_items }
    );
  }

  return {
    id,
    page: pager.page,
    total_pages: pager.total_pages,
    total_items_estimate: pager.total_items,
    sort: allowed[sort],
    fetched: all.length,
    matched_on_page: items.length,
    ...(buyerOnly || minRate > 0
      ? { filters_applied_to_this_page: { buyer_only: buyerOnly, min_rate: minRate || null } }
      : {}),
    items,
    note: "Digikala's review endpoint has no rating histogram - call product_details for rating_stars.",
    attribution: ATTRIBUTION,
  };
}

// ------------------------------------------------- 6. compare products

// Comparing is what a shopper actually does and the API has no endpoint for
// it: fetch each product, align their attributes by title, and surface only
// the attributes whose values actually differ.
async function compareImpl(a: Record<string, unknown>) {
  const rawIds = Array.isArray(a.ids) ? a.ids : [];
  const ids = [...new Set(rawIds.map((x) => Math.floor(num(x, 0))).filter((x) => x > 0))];
  if (ids.length < 2) {
    throw new UpstreamError(
      'Give 2 to 5 product ids, e.g. {"ids": [12345, 67890]}. Get ids from search_digikala or product_details.',
      "usage"
    );
  }
  if (ids.length > 5) {
    throw new UpstreamError("Compare at most 5 products at once - the fetches are sequential.", "usage");
  }

  const products: Array<{ id: number; raw: any; card: Card }> = [];
  for (const id of ids) {
    const raw = (await productRaw(id))?.data?.product;
    if (raw) products.push({ id, raw, card: toCard(raw) });
  }
  if (!products.length) {
    throw new UpstreamError(`None of those ids resolved to a product: ${ids.join(", ")}.`, "http");
  }

  const matrix = new Map<string, Record<string, string>>();
  for (const p of products) {
    for (const group of specsOf(p.raw)) {
      for (const attr of group.attributes) {
        const row = matrix.get(attr.title) ?? {};
        row[String(p.id)] = attr.value;
        matrix.set(attr.title, row);
      }
    }
  }
  const groupFilter = faFold(str(a.spec_group)).toLowerCase();
  const keyword = faFold(str(a.spec_keyword)).toLowerCase();
  const differences: Array<{ attribute: string; values: Record<string, string> }> = [];
  for (const [attribute, row] of matrix) {
    const values = Object.values(row);
    if (values.length < 2 || new Set(values).size < 2) continue;
    if (groupFilter && !attribute.toLowerCase().includes(groupFilter)) continue;
    if (keyword && !attribute.toLowerCase().includes(keyword)) continue;
    differences.push({ attribute, values: row });
  }
  const limited = differences.slice(0, 25);
  const prices = products.map((p) => p.card.price_toman).filter((p): p is number => p !== null);

  return {
    products: products.map((p) => ({
      ...p.card,
      seller_grade: sellerOf(p.raw)?.grade ?? null,
      seller_trusted: sellerOf(p.raw)?.trusted ?? null,
      stock_count: stockCountOf(p.raw),
      warranty:
        faFold(
          (Array.isArray(p.raw.default_variant) ? p.raw.default_variant[0] : p.raw.default_variant)?.warranty?.title_fa
        ) || null,
    })),
    spec_differences: limited,
    spec_differences_total: differences.length,
    ...(differences.length > limited.length
      ? { spec_note: `Showing 25 of ${differences.length} differing specifications - narrow with spec_group or spec_keyword.` }
      : {}),
    currency: "toman",
    ...(prices.length > 1
      ? {
          price_spread_toman: {
            cheapest: Math.min(...prices),
            most_expensive: Math.max(...prices),
            difference: Math.max(...prices) - Math.min(...prices),
          },
        }
      : {}),
    attribution: ATTRIBUTION,
  };
}

// -------------------------------------------------- 7. best value (workflow)

// Not an endpoint wrapper: Digikala ignores price caps, so this sorts by
// price, walks pages until the budget is exhausted, then ranks what is left
// by rating and discount. The top pick gets its seller graded (one extra
// request) because "who sells it" is what makes a cheap deal trustworthy.
async function bestValueImpl(a: Record<string, unknown>) {
  const query = faFold(a.query);
  if (!query) {
    throw new UpstreamError(
      'Pass "query", e.g. {"query": "گوشی سامسونگ", "budget_toman": 20000000}.',
      "usage"
    );
  }
  const budget = toman(a.budget_toman) ?? toman(a.max_price_toman);
  if (budget === null) {
    throw new UpstreamError(
      '"budget_toman" is required (in Toman, not Rial) - without it this is just a search, so use search_digikala instead.',
      "usage"
    );
  }
  const limit = clampLimit(a.limit, 3, 10);
  const minRating = num(a.min_rating, 0);
  const maxPages = Math.min(Math.max(Math.floor(num(a.pages, 1)), 1), 3);
  const cheapest = sortId("cheapest")!;

  const within: Card[] = [];
  let scanned = 0;
  let pagesFetched = 0;
  for (let page = 1; page <= maxPages; page++) {
    const data = (await searchPage({ query, sort: cheapest.id, page, ...listExtras(a) }))?.data ?? {};
    const cards = cardsOf(data.products);
    pagesFetched++;
    scanned += cards.length;
    for (const c of cards) {
      if (c.price_toman !== null && c.price_toman <= budget) within.push(c);
    }
    // Sorted by price ascending: once a whole page is over budget, later
    // pages can only be more expensive.
    if (cards.length && cards.every((c) => (c.price_toman ?? 0) > budget)) break;
    if (!cards.length) break;
  }

// A quality filter can wipe out the whole budget list: the cheapest page is
// exactly where 4-star products are least likely to be. One pass over
// "buyers' choice" (which surfaces well-reviewed products) rescues the most
// common question - "best X under Y" - without scanning everything.
  let candidates = within.filter((c) => (minRating > 0 ? (c.rating_stars ?? -1) >= minRating : true));
  let rescuedBy: string | null = null;
  if (!candidates.length && minRating > 0) {
    const quality = sortId("buyers_choice")!;
    const alt = (await searchPage({ query, sort: quality.id, page: 1, ...listExtras(a) }))?.data ?? {};
    const altCards = cardsOf(alt.products);
    pagesFetched++;
    scanned += altCards.length;
    candidates = altCards.filter(
      (c) => c.price_toman !== null && c.price_toman <= budget && (c.rating_stars ?? -1) >= minRating
    );
    if (candidates.length) rescuedBy = quality.label;
  }
  if (!candidates.length) {
    return empty(
      `Nothing matched '${query}' under ${budget.toLocaleString("en-US")} Toman in the ${pagesFetched} page(s) scanned (${scanned} products).`,
      within.length
        ? `There were ${within.length} products in budget but none met min_rating ${minRating}, even after a second pass over "${sortId("buyers_choice")!.label}". ` +
          `Cheap items often carry too few reviews to earn an honest rating (under ${MIN_RATING_COUNT} reviews this server reports no stars rather than a misleading 5.0), so lower min_rating or raise budget_toman.`
        : "Raise budget_toman, drop filters, or search a broader phrase.",
      { query, budget_toman: budget, pages_scanned: pagesFetched, products_scanned: scanned }
    );
  }

  const ranked = candidates
    .sort(
      (x, y) =>
        (y.rating_stars ?? 0) - (x.rating_stars ?? 0) ||
        y.discount_percent - x.discount_percent ||
        (x.price_toman ?? 0) - (y.price_toman ?? 0)
    )
    .slice(0, limit);

  const top = ranked[0];
  const picks = ranked.map((c) => {
    const reasons: string[] = [];
    if (c.price_toman === Math.min(...candidates.map((x) => x.price_toman ?? Infinity))) {
      reasons.push("cheapest in budget");
    }
    if (c.discount_percent > 0) reasons.push(`${c.discount_percent}% off`);
    if (c.rating_stars !== null) reasons.push(`${c.rating_stars}/5 from ${c.rating_count} reviews`);
    if (c.badges.length) reasons.push(c.badges.join("، "));
    return { ...c, why: reasons };
  });

  // Seller grade + warranty for the top pick only: one request, big payoff.
  let topSeller: unknown = null;
  let topWarranty: string | null = null;
  try {
    const raw = (await productRaw(top.id))?.data?.product;
    if (raw) {
      topSeller = sellerOf(raw);
      const variant = Array.isArray(raw.default_variant) ? raw.default_variant[0] : raw.default_variant;
      topWarranty = faFold(variant?.warranty?.title_fa) || null;
    }
  } catch {
    /* enrichment is optional - never fail a good answer over it */
  }

  return {
    query,
    budget_toman: budget,
    currency: "toman",
    pages_scanned: pagesFetched,
    products_scanned: scanned,
    in_budget: within.length,
    picks,
    returned: picks.length,
    top_pick_seller: topSeller,
    top_pick_warranty: topWarranty,
    ...(rescuedBy
      ? {
          rescued_by: rescuedBy,
          rescue_note: `The cheapest page(s) had nothing rated ${minRating}+ inside the budget, so one extra pass over "${rescuedBy}" was used.`,
        }
      : {}),
    note:
      "Ranked by rating, then discount, then price. Digikala ignores price filters, so results come from " +
      `the ${pagesFetched} page(s) fetched - a higher budget would widen the field.`,
    attribution: ATTRIBUTION,
  };
}

// ------------------------------------------------------ 8. incredible offers

async function offersImpl(a: Record<string, unknown>) {
  const limit = clampLimit(a.limit, 10, 30);
  const minDiscount = num(a.min_discount, 0);
  const data = (await offersRaw())?.data ?? {};
  const list = data.incredible_products_list?.products ?? data.incredible_products_list ?? [];
  const all = cardsOf(list);
  const items = all
    .filter((c) => c.discount_percent >= minDiscount && (a.only_marketable === false || c.in_stock))
    .slice(0, limit);

  if (!items.length) {
    return empty(
      minDiscount > 0
        ? `No current deal is at least ${minDiscount}% off.`
        : "Digikala has no live deals right now.",
      "Try the offers again later, or use search_digikala / best_selling."
    );
  }

  const deals = items.filter((c) => (c.badges ?? []).some((b) => b.includes("شگفت")));
  return {
    items,
    returned: items.length,
    fetched: all.length,
    incredible_count: deals.length,
    min_discount_filter: minDiscount || null,
    ...priceNote(items),
    currency: "toman",
    note: "Deal stock moves fast - each card carries its badge so you can tell شگفت‌انگیز from ordinary discounts.",
    attribution: ATTRIBUTION,
  };
}

// --------------------------------------------------------- 9. best selling

async function bestSellingImpl(a: Record<string, unknown>) {
  const limit = clampLimit(a.limit, 10, 30);
  const data = (await bestSellingRaw())?.data ?? {};
  const all = cardsOf(data.products ?? []);
  const items = filterCards(all, a).slice(0, limit);
  const categories = (Array.isArray(data.categories) ? data.categories : [])
    .map((c: any) => ({ id: num(c?.id, 0) || null, title: faFold(c?.title_fa) }))
    .filter((c: any) => c.id && c.title)
    .slice(0, 12);

  if (!items.length) {
    return empty(
      "Digikala returned no best-selling products right now.",
      "Use search_digikala or browse_category instead."
    );
  }

  return {
    items,
    returned: items.length,
    categories,
    ...priceNote(items),
    currency: "toman",
    note: "This is Digikala's site-wide bestseller list. For a category-specific ranking pass category_id (see `categories`).",
    attribution: ATTRIBUTION,
  };
}

// ---------------------------------------------------- 10. similar products

async function similarImpl(a: Record<string, unknown>) {
  const id = readId(a);
  const limit = clampLimit(a.limit, 10, 30);
  const data = (await similarRaw(id))?.data ?? {};
  const inner = data.data ?? {};
  const all = cardsOf(inner.products ?? []);
  const items = filterCards(all, a).slice(0, limit);
  const label = faFold(inner.title) || "کالاهای مشابه";

  if (!items.length) {
    return empty(
      `Digikala has no similar-product list for id ${id}.`,
      "Call product_details for this product, or search_digikala with its title keywords."
    );
  }

  return {
    id,
    relationship: label,
    items,
    returned: items.length,
    ...priceNote(items),
    currency: "toman",
    attribution: ATTRIBUTION,
  };
}

// ------------------------------------------------------------- tool schemas

const SORT_PROP = {
  type: "string",
  enum: ["relevance", "popular", "newest", "best_selling", "cheapest", "expensive", "fastest", "buyers_choice", "featured"],
  description: `Result ordering: ${SORT_HELP}.`,
};

const FILTER_PROPS = {
  min_price_toman: {
    type: "number",
    description: "Minimum price in Toman (not Rial). Applied to the fetched page, since Digikala's API ignores price filters.",
  },
  max_price_toman: {
    type: "number",
    description:
      "Maximum price in Toman. Asking for a budget auto-switches the sort to cheapest, so the best candidates are on the fetched page.",
  },
  min_rating: {
    type: "number",
    description:
      "Only products rated at least this many stars (0-5). Products with too few reviews to rate honestly are excluded rather than assumed.",
  },
  only_marketable: {
    type: "boolean",
    description: "Default true: hide out-of-stock products. Set false to include them.",
  },
  brand_ids: {
    type: "array",
    items: { type: "number" },
    description: "Restrict to these brand ids (up to 5). Brand ids appear in the `filters` of a search response.",
  },
  seller_type: {
    type: "string",
    enum: ["trusted", "official", "roosta"],
    description: "Restrict by seller type: trusted sellers, official brand stores, or rural sellers (roosta).",
  },
  ready_to_ship: { type: "boolean", description: "Only products already in Digikala's warehouse (fastest delivery)." },
  ship_by_seller: { type: "boolean", description: "Only products that ship from their own seller." },
};

const PAGE_PROPS = {
  page: { type: "number", description: "1-based page number (20 products per page)." },
  limit: { type: "number", description: "How many items to return (default 10, max 30)." },
};

export const TOOLS: ToolDef[] = [
  {
    name: "digikala_suggest",
    description:
      "Turn a vague or misspelled Persian/English phrase into Digikala's own search terms, category ids and trending queries. " +
      "Call this first when you need a category_id for browse_category, when a search returned nothing, or when the user's wording " +
      "is colloquial. Cheap and cached for 6 hours.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'What the user typed, e.g. "لپ تاپ", "گوشی سامسونگ", "target".' },
        limit: { type: "number", description: "Max suggestions per bucket (default 10, max 25)." },
      },
      required: ["query"],
    },
    run: suggestImpl,
  },
  {
    name: "search_digikala",
    description:
      "Search Digikala products and get compact cards: price in Toman, discount, rating, stock, seller name, badges and a real product URL. " +
      "Digikala's own API ignores price/discount filters, so min_price_toman, max_price_toman, min_rating and only_marketable are applied to the " +
      "fetched page - when you pass a budget the sort switches to cheapest automatically, which is how you find the global cheapest. " +
      "total_items_estimate is Digikala's fuzzy count, not exact. Use it for browsing and price checks; use find_best_value for " +
      '"best X under Y toman" questions.',
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'Search phrase, Persian or English, e.g. "هدفون بی سیم", "iphone 15".' },
        category_id: { type: "number", description: "Optional category id to scope the search (from digikala_suggest)." },
        sort: SORT_PROP,
        ...PAGE_PROPS,
        ...FILTER_PROPS,
      },
    },
    run: searchImpl,
  },
  {
    name: "browse_category",
    description:
      "Browse one Digikala category by id and drill into it. Returns the same compact cards as search_digikala plus the category title and its " +
      "sub-categories (with ids you can browse next). Get category ids from digikala_suggest or best_selling.",
    inputSchema: {
      type: "object",
      properties: {
        category_id: { type: "number", description: "Digikala category id, e.g. 22 (mobile)." },
        sort: SORT_PROP,
        page: { type: "number", description: "1-based page number." },
        limit: { type: "number", description: "How many items to return (default 10, max 30)." },
        min_price_toman: FILTER_PROPS.min_price_toman,
        max_price_toman: FILTER_PROPS.max_price_toman,
        min_rating: FILTER_PROPS.min_rating,
        only_marketable: FILTER_PROPS.only_marketable,
      },
      required: ["category_id"],
    },
    run: browseCategoryImpl,
  },
  {
    name: "product_details",
    description:
      "Everything about one product: price and stock, seller name with grade and trust flags, warranty, rating, colours, grouped specifications, " +
      "the expert review and recent buyer comments. Specs are capped at 60 attributes to protect context - narrow them with spec_group " +
      '(e.g. "باتری") or spec_keyword (e.g. "حافظه") when the product is spec-heavy.',
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Digikala product id (the dkp- number)." },
        spec_group: { type: "string", description: 'Only this specification group, e.g. "صفحه نمایش".' },
        spec_keyword: { type: "string", description: 'Only specs whose name or value contains this text, e.g. "رم".' },
        include_comments: { type: "number", description: "Include this many recent comments (0-5, default 0)." },
      },
      required: ["id"],
    },
    run: productDetailsImpl,
  },
  {
    name: "product_reviews",
    description:
      "Written reviews for one product (Digikala's review endpoint returns no rating histogram - product_details has the stars). " +
      "Sort by newest, by most-liked or by buyer reviews only, and filter with buyer_only to hear from people who actually bought it. " +
      "Use min_rate 4 to see what convinced people rather than the complaints.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Digikala product id." },
        sort: { type: "string", enum: ["newest", "buyers", "likes"], description: "Review ordering (default newest)." },
        page: { type: "number", description: "1-based page number." },
        limit: { type: "number", description: "How many reviews to return (default 10, max 30)." },
        buyer_only: { type: "boolean", description: "Only reviews from verified buyers." },
        min_rate: { type: "number", description: "Only reviews with at least this star rating (1-5)." },
      },
      required: ["id"],
    },
    run: productReviewsImpl,
  },
  {
    name: "compare_products",
    description:
      "Compare 2-5 products side by side as a shopper would: price spread, rating, stock, seller grade, warranty, and only the specifications " +
      "whose values actually differ (identical attributes are dropped, since they do not help anyone choose). Pass ids from search_digikala.",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "number" },
          description: "2 to 5 Digikala product ids to compare.",
        },
        spec_group: { type: "string", description: "Only compare specifications containing this text." },
        spec_keyword: { type: "string", description: "Only compare specifications whose name contains this text." },
      },
      required: ["ids"],
    },
    run: compareImpl,
  },
  {
    name: "find_best_value",
    description:
      'Answer "what is the best X I can buy under Y toman?". Sorts by price, walks up to 3 pages until the budget is exhausted, keeps what ' +
      "fits, then ranks by rating and discount - and grades the seller of the top pick, because who sells it decides whether a cheap price is a " +
      "good deal. Prefer this over search_digikala for any question that includes a budget, a minimum rating, or the word 'best'.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'Product to shop for, e.g. "گوشی سامسونگ", "ماشین اصلاح".' },
        budget_toman: { type: "number", description: "Maximum price in Toman (not Rial)." },
        max_price_toman: { type: "number", description: "Alias for budget_toman, accepted for symmetry with search_digikala." },
        min_rating: { type: "number", description: "Minimum star rating (0-5)." },
        limit: { type: "number", description: "How many picks to return (default 3, max 10)." },
        pages: { type: "number", description: "How many price-sorted pages to scan (default 1, max 3). More pages = slower but wider coverage." },
        brand_ids: FILTER_PROPS.brand_ids,
        seller_type: FILTER_PROPS.seller_type,
        ready_to_ship: FILTER_PROPS.ready_to_ship,
      },
      required: ["query", "budget_toman"],
    },
    run: bestValueImpl,
  },
  {
    name: "incredible_offers",
    description:
      "Today's Digikala deals (شگفت‌انگیز and other promotions) with their discount percentages, sorted as Digikala lists them. " +
      "Each card keeps its badge so you can distinguish a real شگفت‌انگیز deal from an everyday discount. Stock on deals moves fast.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many deals to return (default 10, max 30)." },
        min_discount: { type: "number", description: "Only deals at least this percent off." },
        only_marketable: { type: "boolean", description: "Default true: hide out-of-stock deals." },
      },
    },
    run: offersImpl,
  },
  {
    name: "best_selling",
    description:
      "Digikala's site-wide bestseller list, with the category ids needed to go deeper. Good for open-ended questions like " +
      '"what is popular in Iran right now" or as a fallback when a specific search finds nothing.',
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many products to return (default 10, max 30)." },
        min_price_toman: FILTER_PROPS.min_price_toman,
        max_price_toman: FILTER_PROPS.max_price_toman,
        min_rating: FILTER_PROPS.min_rating,
        only_marketable: FILTER_PROPS.only_marketable,
      },
    },
    run: bestSellingImpl,
  },
  {
    name: "similar_products",
    description:
      "What Digikala recommends alongside a given product (its کالاهای مشابه list). Useful to widen a shortlist after product_details, " +
      "or to find an alternative when something is out of stock. Always cheaper or better documented than guessing keywords.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Digikala product id." },
        limit: { type: "number", description: "How many recommendations to return (default 10, max 30)." },
        min_price_toman: FILTER_PROPS.min_price_toman,
        max_price_toman: FILTER_PROPS.max_price_toman,
        min_rating: FILTER_PROPS.min_rating,
        only_marketable: FILTER_PROPS.only_marketable,
      },
      required: ["id"],
    },
    run: similarImpl,
  },
];