// Endpoints, pacing and cache lifetimes. Everything here was verified
// against the live API with scripts/probe-api.mjs.

import { HOUR, MIN } from "./cache.js";

export const PORT = 3000;

export const DK_API = "https://api.digikala.com";
export const DK_SITE = "https://www.digikala.com";

// A real Chrome UA. The edge is measurably friendlier to browser-shaped
// requests than to a bare node-fetch one.
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

// Digikala's CDN does not answer bursts with HTTP 429. It answers with a
// 307 back to the same URL plus Set-Cookie: digicdn_cookie=... - a cookie
// challenge, not a redirect (the body is literally an empty HTML page).
// http.ts solves that challenge; this gap just keeps us from inviting one.
export const MIN_GAP_MS = 500;
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 2000;

// Prices in the API are Rials; Iranians quote Tomans (1 Toman = 10 Rials).
export const RIAL_PER_TOMAN = 10;

// Ratings arrive as a 0-100 score. Below this many reviews a score is
// noise, so we report null instead of a confident-looking star value.
export const MIN_RATING_COUNT = 10;

export const TTL = {
  autocomplete: 6 * HOUR, // suggestions barely move
  search: 10 * MIN, // prices move, result sets do not
  category: 30 * MIN,
  product: 30 * MIN,
  comments: 6 * HOUR,
  offers: 5 * MIN, // discount windows are the volatile part
};

export const ATTRIBUTION =
  "Data comes from Digikala's public web API. Prices, stock and discounts change " +
  "constantly - always confirm on digikala.com before buying. This server is not " +
  "affiliated with or endorsed by Digikala.";

export const BLOCKED_MSG =
  "Digikala's CDN keeps asking for its cookie challenge instead of serving data " +
  "(this is how it throttles, instead of HTTP 429). Wait a moment and retry with a " +
  "narrower query. Do not retry in a burst - that prolongs it.";

