// One polite HTTP entry point for the whole server.
//
// The thing that shapes this file: Digikala's CDN does not throttle with
// HTTP 429. When it wants you to prove you are a normal client it answers
// 307, pointing at the exact same URL, with Set-Cookie: digicdn_cookie=...
// and an empty HTML body. A cookie-less client (undici included) follows
// the redirect into itself and dies with "redirect count exceeded".
//
// So: keep the cookie, resend once, and cache it for later requests.

import { BLOCKED_MSG, DK_API, MAX_RETRIES, MIN_GAP_MS, RETRY_DELAY_MS, UA } from "./config.js";

export class UpstreamError extends Error {
  kind: "blocked" | "http" | "network" | "usage";
  status?: number;
  retryAfterMs?: number;
  constructor(
    message: string,
    kind: UpstreamError["kind"],
    opts?: { status?: number; retryAfterMs?: number }
  ) {
    super(message);
    this.kind = kind;
    if (opts?.status !== undefined) this.status = opts.status;
    if (opts?.retryAfterMs !== undefined) this.retryAfterMs = opts.retryAfterMs;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Serialized pacing: every call waits its turn and then holds the slot, so
// parallel tool calls cannot produce a burst even if the agent fires many.
let nextSlot = 0;
async function pace(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait > 0) await sleep(wait);
}

let digicdnCookie: string | null = null;

function webHeaders(cookie?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json",
    "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
    Referer: "https://www.digikala.com/",
    "X-Web-Client-Id": "web",
    "X-Web-Client": "desktop",
    // Trims the tracking/SEO blocks Digikala ships in web responses.
    "X-Web-Optimize-Response": "1",
  };
  if (cookie) headers.Cookie = `digicdn_cookie=${cookie}`;
  return headers;
}

// Returns true when the response carried a fresh challenge cookie.
function harvestCookie(res: Response): boolean {
  const raw = res.headers.get("set-cookie") || "";
  const match = raw.match(/digicdn_cookie=([^;\s]+)/);
  if (!match) return false;
  digicdnCookie = match[1];
  return true;
}

export function buildUrl(path: string, params: Record<string, unknown> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const query = qs.toString();
  return `${DK_API}${path}${query ? `?${query}` : ""}`;
}

// Digikala sometimes hands back an HTML block page with a 200.
function looksLikeHtml(text: string): boolean {
  return /^\s*<(!doctype|html)/i.test(text);
}

export async function dkJson(
  path: string,
  params: Record<string, unknown> = {}
): Promise<any> {
  const url = buildUrl(path, params);
  let lastError: UpstreamError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await pace();
    let res: Response;
    try {
      res = await fetch(url, { headers: webHeaders(digicdnCookie), redirect: "manual" });
    } catch (err) {
      lastError = new UpstreamError(
        `Could not reach Digikala (${err instanceof Error ? err.message : String(err)}). ` +
          "Check this machine's internet access, then retry.",
        "network"
      );
      await sleep(RETRY_DELAY_MS * (attempt + 1));
      continue;
    }

    // The cookie challenge: resend once, with the cookie it just handed us.
    if (res.status === 307 || res.status === 308) {
      if (harvestCookie(res)) {
        await pace();
        try {
          res = await fetch(url, { headers: webHeaders(digicdnCookie), redirect: "manual" });
        } catch {
          /* the status check below reports it */
        }
      }
      if (res.status === 307 || res.status === 308) {
        digicdnCookie = null; // stale by now - ask for a fresh challenge
        lastError = new UpstreamError(BLOCKED_MSG, "blocked", { status: res.status });
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
    }

    if (res.status === 429) {
      const retry = parseFloat(res.headers.get("retry-after") || "") || 0;
      lastError = new UpstreamError(BLOCKED_MSG, "blocked", {
        status: 429,
        retryAfterMs: retry * 1000 || RETRY_DELAY_MS,
      });
      await sleep((retry * 1000 || RETRY_DELAY_MS) * (attempt + 1));
      continue;
    }

    if (res.status >= 500) {
      lastError = new UpstreamError(
        `Digikala returned HTTP ${res.status}. That is on their side - retry in a moment.`,
        "http",
        { status: res.status }
      );
      await sleep(RETRY_DELAY_MS * (attempt + 1));
      continue;
    }

    if (res.status === 404) {
      throw new UpstreamError(
        `Not found upstream (404) for ${path}. The id is probably wrong - check "search_digikala" first.`,
        "http",
        { status: 404 }
      );
    }

    if (!res.ok) {
      throw new UpstreamError(
        `Digikala rejected the request with HTTP ${res.status}. Rephrase or narrow the query, and do not repeat it as-is.`,
        "http",
        { status: res.status }
      );
    }

    const text = await res.text();
    if (looksLikeHtml(text)) {
      lastError = new UpstreamError(
        "Digikala answered with an HTML page instead of JSON (bot check). Wait a minute and retry with a narrower query.",
        "blocked",
        { status: res.status }
      );
      await sleep(RETRY_DELAY_MS * (attempt + 1));
      continue;
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new UpstreamError(
        "Digikala returned a body that is not JSON. This usually means the endpoint changed - tell the server owner to run 'npm run probe'.",
        "http"
      );
    }
  }

  throw lastError ?? new UpstreamError("Digikala request failed for an unknown reason.", "network");
}