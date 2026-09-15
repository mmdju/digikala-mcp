// Projection layer: raw Digikala JSON -> small, high-signal objects.
//
// This is the whole point of the server. One search page is ~700KB of
// tracking blobs, SEO text and widget wrappers; a category page is ~350KB
// and the offers page ~1.5MB. An agent cannot afford any of that, so every
// tool returns compact records built here and nothing else.
//
// Field paths were verified against the live API (scripts/probe-api.mjs plus
// a field-mapping pass): price lives on default_variant.price and the seller
// on default_variant.seller. default_variant is an object for a marketable
// product and an empty array for one that is out of stock - both shapes show
// up in the same payload, which is why variantOf() exists.

import { ATTRIBUTION, DK_SITE, MIN_RATING_COUNT, RIAL_PER_TOMAN, TTL } from "./config.js";
import { cached } from "./cache.js";
import { UpstreamError, dkJson } from "./http.js";
import { faFold, num, productUrl, short, stars, str } from "./normalize.js";

export interface Card {
  id: number;
  title: string;
  price_toman: number | null;
  price_before_toman: number | null;
  discount_percent: number;
  rating_stars: number | null;
  rating_count: number;
  in_stock: boolean;
  seller: string | null;
  badges: string[];
  url: string | null;
}

const toToman = (rial: unknown): number | null => {
  const r = num(rial, 0);
  return r > 0 ? Math.round(r / RIAL_PER_TOMAN) : null;
};

function variantOf(raw: any): any {
  const dv = raw?.default_variant;
  if (Array.isArray(dv)) return dv[0] ?? raw?.variants?.[0] ?? {};
  return dv ?? raw?.variants?.[0] ?? {};
}

function priceOf(raw: any) {
  const p = variantOf(raw)?.price ?? {};
  const selling = toToman(p?.selling_price);
  const before = toToman(p?.rrp_price);
  return {
    selling,
    before: before && selling && before > selling ? before : null,
    discount: num(p?.discount_percent, 0),
    stock_count: num(p?.marketable_stock, 0),
    is_incredible: p?.is_incredible === true,
    badge: str(p?.badge?.title) || null,
  };
}

export function sellerOf(raw: any) {
  const s = variantOf(raw)?.seller;
  if (!s) return null;
  return {
    name: str(s?.title) || null,
    code: str(s?.code) || null,
    url: str(s?.url) || null,
    grade: str(s?.grade?.label) || null,
    trusted: s?.properties?.is_trusted === true,
    official: s?.properties?.is_official === true,
    stars: num(s?.stars, 0) || null,
    rating_count: num(s?.rating?.total_count, 0),
  };
}

// Badges are the fastest way for an agent to explain "why this one".
function badgesOf(raw: any): string[] {
  const price = priceOf(raw);
  const v = variantOf(raw);
  const out: string[] = [];
  if (price.badge) out.push(price.badge);
  if (price.is_incredible) out.push("شگفت‌انگیز");
  if (raw?.digiplus?.is_jet_eligible === true) out.push("ارسال سریع دیجی‌کالا");
  if (v?.properties?.in_digikala_warehouse === true) out.push("انبار دیجی‌کالا");
  if (v?.properties?.is_ship_by_seller === true) out.push("ارسال توسط فروشنده");
  if (sellerOf(raw)?.trusted) out.push("فروشنده معتبر");
  return [...new Set(out)];
}

function stockCountOf(raw: any): number {
  const variants: any[] = Array.isArray(raw?.variants) ? raw.variants : [];
  return Math.max(
    priceOf(raw).stock_count,
    ...variants.map((v: any) => num(v?.price?.marketable_stock, 0)),
    0
  );
}

export function toCard(raw: any): Card {
  const price = priceOf(raw);
  const rating = stars(raw?.rating?.rate, raw?.rating?.count, MIN_RATING_COUNT);
  return {
    id: num(raw?.id, 0),
    title: faFold(raw?.title_fa),
    price_toman: price.selling,
    price_before_toman: price.before,
    discount_percent: price.discount,
    rating_stars: rating.stars,
    rating_count: rating.count,
    in_stock: str(raw?.status) === "marketable" && (price.selling ?? 0) > 0,
    seller: sellerOf(raw)?.name ?? null,
    badges: badgesOf(raw),
    url: productUrl(raw?.url?.uri, DK_SITE),
  };
}

export function cardsOf(list: unknown): Card[] {
  if (!Array.isArray(list)) return [];
  return list.filter((p) => p && typeof p === "object").map(toCard);
}

export { stockCountOf };

// The v2 category page hides its products inside widget wrappers:
// data.widgets[] (vertical_product_listing) -> data.widgets[] (product) -> data.
export function extractWidgetProducts(widgets: unknown): any[] {
  if (!Array.isArray(widgets)) return [];
  const out: any[] = [];
  for (const w of widgets) {
    for (const inner of (w as any)?.data?.widgets ?? []) {
      if (inner?.type === "product" && inner?.data) out.push(inner.data);
    }
  }
  return out;
}

// Products carry 60-120 specs; a shopper compares a handful of them, so the
// caller can narrow by group (e.g. "باتری") and/or a keyword ("ظرفیت").
export function specsOf(
  raw: any,
  opts: { group?: string; keyword?: string; maxGroups?: number } = {}
): Array<{ group: string; attributes: Array<{ title: string; value: string }> }> {
  const groups: any[] = Array.isArray(raw?.specifications) ? raw.specifications : [];
  const wantGroup = faFold(opts.group ?? "").toLowerCase();
  const wantKeyword = faFold(opts.keyword ?? "").toLowerCase();
  const out: Array<{ group: string; attributes: Array<{ title: string; value: string }> }> = [];
  for (const g of groups) {
    const title = faFold(g?.title);
    if (wantGroup && !title.toLowerCase().includes(wantGroup)) continue;
    const attributes: Array<{ title: string; value: string }> = [];
    for (const a of g?.attributes ?? []) {
      const name = faFold(a?.title);
      const value = (Array.isArray(a?.values) ? a.values : [])
        .map((v: unknown) => str(v).trim())
        .filter(Boolean)
        .join("، ");
      if (!name || !value) continue;
      const hay = `${name} ${value}`.toLowerCase();
      if (wantKeyword && !hay.includes(wantKeyword)) continue;
      attributes.push({ title: name, value });
    }
    if (attributes.length) out.push({ group: title, attributes });
  }
  return opts.maxGroups ? out.slice(0, opts.maxGroups) : out;
}

export function commentsOf(list: unknown, limit: number) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, limit).map((c: any) => ({
    rate: num(c?.rate, 0) || null,
    title: short(c?.title, 90),
    body: short(c?.body, 400),
    buyer: c?.is_buyer === true,
    date: str(c?.relative_date || c?.created_at) || null,
    likes: num(c?.reactions?.likes, 0),
    advantage: short(c?.advantages, 120),
    disadvantage: short(c?.disadvantages, 120),
  }));
}

// Sort ids are stable but meaningless to read; agents get names instead.
const SORTS: Record<string, { id: number; label: string }> = {
  relevance: { id: 22, label: "مرتبط‌ترین" },
  popular: { id: 4, label: "پربازدیدترین" },
  newest: { id: 1, label: "جدیدترین" },
  best_selling: { id: 7, label: "پرفروشترین" },
  cheapest: { id: 20, label: "ارزان‌ترین" },
  expensive: { id: 21, label: "گران‌ترین" },
  fastest: { id: 25, label: "سریع‌ترین ارسال" },
  buyers_choice: { id: 27, label: "پیشنهاد خریداران" },
  featured: { id: 29, label: "منتخب" },
};

export function sortId(name: unknown): { id: number; label: string } | null {
  return SORTS[str(name).trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? null;
}

export const SORT_HELP = Object.entries(SORTS)
  .map(([k, v]) => `${k} (${v.label})`)
  .join(", ");

export function pagerOf(data: any) {
  const p = data?.pager ?? {};
  return {
    page: num(p?.current_page, 1),
    total_pages: num(p?.total_pages, 1),
    total_items: num(p?.total_items, 0),
  };
}

// "Nothing found" is a successful call with an empty list and a next step -
// never a bare upstream error, which teaches the agent nothing.
export function empty(message: string, suggestion?: string, extra: Record<string, unknown> = {}) {
  return {
    items: [],
    returned: 0,
    message,
    ...(suggestion ? { suggestion } : {}),
    ...extra,
    attribution: ATTRIBUTION,
  };
}

// ------------------------------------------------------- cached endpoints

export interface SearchOpts {
  query?: string;
  categoryId?: number;
  sort?: number;
  page?: number;
  brandIds?: number[];
  sellerType?: string;
  readyToShip?: boolean;
  shipBySeller?: boolean;
}

export function searchPage(opts: SearchOpts): Promise<any> {
  if (!opts.query && !opts.categoryId) {
    throw new UpstreamError(
      'A search needs a "query", a "category_id", or both. Use digikala_suggest first if you only have a vague idea.',
      "usage"
    );
  }
  const params: Record<string, unknown> = {};
  if (opts.query) params.q = opts.query;
  if (opts.categoryId) params.category_id = opts.categoryId;
  if (opts.sort) params.sort = opts.sort;
  if (opts.page && opts.page > 1) params.page = opts.page;
  if (opts.readyToShip) params.has_ready_to_shipment = 1;
  if (opts.shipBySeller) params.has_ship_by_seller = 1;
  if (opts.sellerType) params["seller_types[0]"] = opts.sellerType;
  (opts.brandIds ?? []).forEach((id, i) => (params[`brands[${i}]`] = id));

  const key = `search:${JSON.stringify(params)}`;
  return cached(key, TTL.search, () => dkJson("/v1/search/", params));
}

export function productRaw(id: number): Promise<any> {
  return cached(`product:${id}`, TTL.product, () => dkJson(`/v2/product/${id}/`));
}

export function categoryRaw(id: number, opts: { sort?: number; page?: number } = {}): Promise<any> {
  const params: Record<string, unknown> = {};
  if (opts.sort) params.sort = opts.sort;
  if (opts.page && opts.page > 1) params.page = opts.page;
  const key = `category:${id}:${JSON.stringify(params)}`;
  return cached(key, TTL.category, () => dkJson(`/v2/category/${id}/`, params));
}

export function commentsRaw(id: number, opts: { sort?: string; page?: number } = {}): Promise<any> {
  const params: Record<string, unknown> = {};
  if (opts.sort) params.sort = opts.sort;
  if (opts.page && opts.page > 1) params.page = opts.page;
  const key = `comments:${id}:${JSON.stringify(params)}`;
  return cached(key, TTL.comments, () => dkJson(`/v1/product/${id}/comments/`, params));
}

export function similarRaw(id: number): Promise<any> {
  return cached(`similar:${id}`, TTL.search, () => dkJson(`/v1/product/${id}/recommendation/`));
}

export function offersRaw(): Promise<any> {
  return cached("offers", TTL.offers, () => dkJson("/v1/incredible-offers/"));
}

export function bestSellingRaw(): Promise<any> {
  return cached("best-selling", TTL.category, () => dkJson("/v1/best-selling/"));
}

export function suggestRaw(query: string): Promise<any> {
  return cached(`suggest:${faFold(query)}`, TTL.autocomplete, () =>
    dkJson("/v1/autocomplete/", { q: query })
  );
}