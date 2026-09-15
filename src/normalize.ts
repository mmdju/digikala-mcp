// Pure helpers: Persian/Arabic text folding, Digikala-shaped numbers, and
// the coercions the projection layer needs.
//
// Why folding matters: Iranian keyboards produce both the Arabic yeh/kaf
// (ي U+064A, ك U+0643) and the Persian ones (ی U+06CC, ک U+06A9), plus
// Arabic-Indic digits. Two spellings of one word are two different queries
// upstream, and titles that look identical to a human compare as different
// strings to code.

export const ZWNJ = "\u200C"; // نیم‌فاصله

const FOLD: Array<[RegExp, string]> = [
  [/[\u064A\u0649]/g, "\u06CC"], // ي ى -> ی
  [/[\u0643]/g, "\u06A9"], // ك -> ک
  [/[\u0629]/g, "\u0647"], // ة -> ه
  [/[\u0623\u0625\u0622]/g, "\u0627"], // أ إ آ -> ا
  [/[\u064B-\u0652\u0640\u0670]/g, ""], // harakat + tatweel
  [/[\u200B\u200E\u200F\u202A-\u202E]/g, ""], // zero-width + direction marks
];

// ٠-٩ (U+0660), ۰-۹ (U+06F0), ०-९ (U+0966) all mean the same digits.
function foldDigits(s: string): string {
  return s.replace(/[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F]/g, (ch) => {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0660 && c <= 0x0669) return String(c - 0x0660);
    if (c >= 0x06f0 && c <= 0x06f9) return String(c - 0x06f0);
    return String(c - 0x0966);
  });
}

export function faFold(input: unknown): string {
  let s = str(input);
  for (const [re, to] of FOLD) s = s.replace(re, to);
  s = foldDigits(s);
  return s.replace(/\s+/g, " ").trim();
}

// "لپ تاپ" vs "لپ‌تاپ" vs "لپتاپ": compound words are written three ways.
// Only used as a fallback when the first search comes back empty, so the
// happy path stays a single request.
export function faSearchVariants(input: unknown): string[] {
  const folded = faFold(input);
  const spaced = folded.replace(/[\u200C\u200D]/g, " ").replace(/\s+/g, " ").trim();
  const out = [spaced];
  if (spaced.includes(" ")) {
    out.push(spaced.replace(/ /g, ZWNJ));
    out.push(spaced.replace(/ /g, ""));
  }
  return [...new Set(out.filter(Boolean))];
}

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : parseFloat(str(v));
  return Number.isFinite(n) ? n : fallback;
}

export function short(s: unknown, n = 220): string | null {
  const t = str(s).replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > n ? t.slice(0, n - 1) + "..." : t;
}

export function stripHtml(s: unknown, n = 220): string | null {
  const t = str(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return short(t, n);
}

export function clampLimit(v: unknown, def = 10, max = 30): number {
  return Math.min(Math.max(Math.floor(num(v, def)) || def, 1), max);
}

export function clampPage(v: unknown, max = 50): number {
  return Math.min(Math.max(Math.floor(num(v, 1)) || 1, 1), max);
}

// Digikala reports ratings as a 0-100 score with a review count. Below
// MIN_RATING_COUNT reviews the score is noise, so stars stays null rather
// than showing a confident-looking 5.0 built from 2 votes.
export function stars(rate: unknown, count: unknown, minCount: number): { stars: number | null; count: number } {
  const n = Math.max(0, Math.round(num(count, 0)));
  const r = num(rate, 0);
  if (n < minCount || r <= 0) return { stars: null, count: n };
  return { stars: Math.round((r / 20) * 10) / 10, count: n };
}

// Absolute product URL. The API returns url.uri as a site-relative path.
export function productUrl(uri: unknown, site: string): string | null {
  const u = str(uri);
  if (!u) return null;
  return u.startsWith("http") ? u : `${site}${u}`;
}

// First usable image from a Digikala images block (main.url / main.webp_url).
export function imageUrl(images: unknown): string | null {
  const main = (images as any)?.main;
  for (const key of ["url", "webp_url"]) {
    const list = main?.[key];
    if (Array.isArray(list) && typeof list[0] === "string") return list[0];
  }
  return null;
}