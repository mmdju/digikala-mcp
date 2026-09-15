// Pure-helper tests. No network, no upstream calls: safe to run in CI.
// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  ZWNJ,
  clampLimit,
  clampPage,
  faFold,
  faSearchVariants,
  imageUrl,
  num,
  productUrl,
  short,
  stars,
  stripHtml,
} from "../dist/normalize.js";

const SITE = "https://www.digikala.com";

test("Arabic kaf and yeh fold to their Persian counterparts", () => {
  assert.equal(faFold("\u0643"), "\u06A9"); // ك -> ک
  assert.equal(faFold("\u064A"), "\u06CC"); // ي -> ی
  assert.equal(faFold("\u0649"), "\u06CC"); // ى -> ی
});

test("Arabic alef variants and ta marbuta fold down", () => {
  assert.equal(faFold("\u0623\u0625\u0622"), "\u0627\u0627\u0627"); // أ إ آ -> ا
  assert.equal(faFold("\u0629"), "\u0647"); // ة -> ه
});

test("harakat and tatweel are removed", () => {
  assert.equal(faFold("a\u064B\u0640b"), "ab");
});

test("zero-width and direction marks go, but ZWNJ stays", () => {
  assert.equal(faFold("a\u200Bb"), "ab");
  assert.equal(faFold("a\u200Fb"), "ab");
  assert.equal(faFold(`a${ZWNJ}b`), `a${ZWNJ}b`);
});

test("Arabic-Indic, Persian and Devanagari digits all become ASCII", () => {
  assert.equal(faFold("\u0660\u0661\u0662"), "012");
  assert.equal(faFold("\u06F0\u06F1\u06F2"), "012");
  assert.equal(faFold("\u0966\u0967\u0968"), "012");
});

test("whitespace collapses, and non-strings become empty", () => {
  assert.equal(faFold("  a \n b  "), "a b");
  assert.equal(faFold(null), "");
  assert.equal(faFold(undefined), "");
  assert.equal(faFold(42), "");
});

test("a compound word yields space, ZWNJ and joined spellings", () => {
  assert.deepEqual(faSearchVariants("a b"), ["a b", `a${ZWNJ}b`, "ab"]);
});

test("a single word yields exactly one variant", () => {
  assert.deepEqual(faSearchVariants("solo"), ["solo"]);
});

test("an already-ZWNJ spelling is re-expanded the same way", () => {
  assert.deepEqual(faSearchVariants(`a${ZWNJ}b`), ["a b", `a${ZWNJ}b`, "ab"]);
});

test("a score below the review floor is withheld instead of shown as 5.0", () => {
  assert.deepEqual(stars(100, 1, 10), { stars: null, count: 1 });
  assert.deepEqual(stars(93.33, 3, 10), { stars: null, count: 3 });
});

test("a 0-100 score converts to stars", () => {
  assert.deepEqual(stars(98.57, 14, 10), { stars: 4.9, count: 14 });
  assert.deepEqual(stars(100, 10, 10), { stars: 5, count: 10 });
  assert.deepEqual(stars(80, 25, 10), { stars: 4, count: 25 });
});

test("an unrated product stays null even with many reviews", () => {
  assert.deepEqual(stars(0, 500, 10), { stars: null, count: 500 });
});

test("relative product paths are made absolute", () => {
  assert.equal(productUrl("/product/dkp-1/x/", SITE), `${SITE}/product/dkp-1/x/`);
  assert.equal(productUrl("https://x/y", SITE), "https://x/y");
  assert.equal(productUrl("", SITE), null);
  assert.equal(productUrl(null, SITE), null);
});

test("long text is truncated with an ellipsis, blank stays null", () => {
  assert.equal(short("abcdefghijklmn", 10), "abcdefghi...");
  assert.equal(short("short", 10), "short");
  assert.equal(short("   ", 10), null);
  assert.equal(short(null, 10), null);
});

test("html is stripped from comment bodies", () => {
  assert.equal(stripHtml("<p>hello</p><b>world</b>", 50), "hello world");
  assert.equal(stripHtml("a&nbsp;b&amp;c", 50), "a b&c");
});

test("limits clamp to 1..30 and pages to 1..50", () => {
  assert.equal(clampLimit(undefined), 10);
  assert.equal(clampLimit(0), 10);
  assert.equal(clampLimit(100), 30);
  assert.equal(clampLimit(-5), 1);
  assert.equal(clampLimit(3.7), 3);
  assert.equal(clampPage(0), 1);
  assert.equal(clampPage(999), 50);
});

test("numbers coerce from strings and fall back on junk", () => {
  assert.equal(num("12.5", 0), 12.5);
  assert.equal(num(7, 0), 7);
  assert.equal(num("junk", 3), 3);
  assert.equal(num(undefined, 3), 3);
});

test("the first usable image is picked from an images block", () => {
  assert.equal(imageUrl({ main: { url: ["a.jpg"] } }), "a.jpg");
  assert.equal(imageUrl({ main: { webp_url: ["b.webp"] } }), "b.webp");
  assert.equal(imageUrl({ main: { url: [] } }), null);
  assert.equal(imageUrl({}), null);
  assert.equal(imageUrl(null), null);
});
