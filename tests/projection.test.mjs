// Projection tests against recorded payload shapes, not the live API.
// The three shapes below are the ones that actually bite:
//   1. a marketable product, where default_variant is an object with price
//   2. an out-of-stock product, where default_variant is an EMPTY ARRAY
//   3. a variant list, where default_variant is an array of variants
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { cardsOf, empty, extractWidgetProducts, pagerOf, sellerOf, sortId, toCard } from "../dist/project.js";

const ZWNJ = "\u200C";
const SITE = "https://www.digikala.com";

const marketable = {
  id: 123,
  title_fa: "Headphone A",
  status: "marketable",
  url: { uri: "/product/dkp-123/headphone-a/" },
  rating: { rate: 98.57, count: 14 },
  default_variant: {
    price: {
      selling_price: 188000000, // Rials
      rrp_price: 200000000,
      discount_percent: 6,
      marketable_stock: 3,
      is_incredible: true,
      badge: { title: "Fast" },
    },
    seller: {
      title: "Seller X",
      code: "sx",
      grade: { label: "Excellent" },
      properties: { is_trusted: true },
    },
    properties: { in_digikala_warehouse: true },
  },
};

// Out of stock: default_variant comes back as an empty array, not an object.
const outOfStock = {
  id: 9,
  title_fa: "Gone",
  status: "unavailable",
  url: { uri: "/product/dkp-9/gone/" },
  rating: { rate: 100, count: 1 },
  default_variant: [],
};

test("a marketable product projects to a compact card", () => {
  const card = toCard(marketable);
  assert.equal(card.id, 123);
  assert.equal(card.price_toman, 18_800_000); // Rials -> Toman
  assert.equal(card.price_before_toman, 20_000_000);
  assert.equal(card.discount_percent, 6);
  assert.equal(card.rating_stars, 4.9);
  assert.equal(card.rating_count, 14);
  assert.equal(card.in_stock, true);
  assert.equal(card.seller, "Seller X");
  assert.equal(card.url, `${SITE}/product/dkp-123/headphone-a/`);
  assert.deepEqual(card.badges, [
    "Fast",
    `شگفت${ZWNJ}انگیز`,
    `انبار دیجی${ZWNJ}کالا`,
    "فروشنده معتبر",
  ]);
});

test("an out-of-stock item (empty default_variant array) degrades cleanly", () => {
  const card = toCard(outOfStock);
  assert.equal(card.price_toman, null);
  assert.equal(card.in_stock, false);
  assert.equal(card.rating_stars, null); // one review is not a rating
  assert.equal(card.rating_count, 1);
  assert.equal(card.seller, null);
  assert.deepEqual(card.badges, []);
  assert.equal(card.url, `${SITE}/product/dkp-9/gone/`);
});

test("a default_variant that is a variant list still yields a price", () => {
  const card = toCard({
    id: 5,
    title_fa: "V",
    status: "marketable",
    rating: { rate: 90, count: 40 },
    default_variant: [{ price: { selling_price: 4950000 }, seller: { title: "S" } }],
  });
  assert.equal(card.price_toman, 495_000);
  assert.equal(card.in_stock, true);
  assert.equal(card.rating_stars, 4.5);
  assert.equal(card.seller, "S");
});

test("a crossed-out price is dropped when it is not actually higher", () => {
  const card = toCard({
    id: 1,
    title_fa: "P",
    status: "marketable",
    rating: { rate: 80, count: 20 },
    default_variant: { price: { selling_price: 1000, rrp_price: 900 } },
  });
  assert.equal(card.price_toman, 100);
  assert.equal(card.price_before_toman, null);
});

test("cardsOf ignores a non-list and skips junk entries", () => {
  assert.deepEqual(cardsOf(null), []);
  assert.deepEqual(cardsOf("nope"), []);
  assert.equal(cardsOf([null, marketable, 7, outOfStock]).length, 2);
});

test("seller details survive the projection", () => {
  const seller = sellerOf(marketable);
  assert.equal(seller.name, "Seller X");
  assert.equal(seller.grade, "Excellent");
  assert.equal(seller.trusted, true);
  assert.equal(seller.official, false);
  assert.equal(sellerOf(outOfStock), null);
});

test("sort names map to Digikala's numeric ids", () => {
  assert.equal(sortId("cheapest").id, 20);
  assert.equal(sortId("buyers_choice").id, 27);
  assert.equal(sortId("BUYERS CHOICE").id, 27); // case and spaces normalise
  assert.equal(sortId("bogus"), null);
});

test("the pager is flattened and stays an estimate", () => {
  assert.deepEqual(pagerOf({ pager: { current_page: 2, total_pages: 5, total_items: 712 } }), {
    page: 2,
    total_pages: 5,
    total_items: 712,
  });
  assert.deepEqual(pagerOf({}), { page: 1, total_pages: 1, total_items: 0 });
});

test("an empty result is still a success envelope with a next step", () => {
  const envelope = empty("nothing found", "widen the query", { pages_scanned: 2 });
  assert.deepEqual(envelope.items, []);
  assert.equal(envelope.returned, 0);
  assert.equal(envelope.message, "nothing found");
  assert.equal(envelope.suggestion, "widen the query");
  assert.equal(envelope.pages_scanned, 2);
  assert.equal(empty("nothing found").suggestion, undefined);
});

test("category widgets are unwrapped down to product data", () => {
  const widgets = [
    {
      type: "vertical_product_listing",
      data: { widgets: [{ type: "product", data: { id: 1 } }, { type: "banner", data: { id: 2 } }] },
    },
    { type: "product", data: { id: 3 } }, // top-level products are not collected
  ];
  assert.deepEqual(extractWidgetProducts(widgets), [{ id: 1 }]);
  assert.deepEqual(extractWidgetProducts(null), []);
});
