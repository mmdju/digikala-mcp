// Verify the LIVE hosted endpoint speaks MCP correctly.
// Anyone can run this - it only needs Node.js 18+, no install:
//
//   node verify-live.mjs
//
// What it does: lists tools over Streamable HTTP, calls tools/list +
// tools/call for a search, a details read and an invalid-id error path,
// and asserts the honest-data contract (toman prices, null stars under
// the review floor, empty envelope on misses), and compares the version the
// live service reports against the newest release in this repo's CHANGELOG.
// No source needed.
//
// Flake policy (why this file looks the way it does):
// Digikala's CDN sometimes answers the GitHub Actions region with a
// cookie challenge instead of data - the worker then correctly returns
// isError with "Digikala's CDN keeps asking...". That is an upstream
// block, not a broken server, so those checks report SKIP (exit 0) and
// only real contract violations report FAIL (exit 1).
import { readFileSync } from "node:fs";

const ENDPOINT = process.env.DIGIKALA_MCP_URL ?? "https://digikala-mcp.mmdju.workers.dev/mcp";
const HEALTH = ENDPOINT.replace(/\/mcp\/?$/, "/health");
const UA = { "user-agent": "digikala-mcp-verify/1.0" };
// Prefixes the worker uses to say "upstream refused this region", newest
// first. The 0.6.4 worker reworded this from "Digikala's CDN keeps asking" to
// "Digikala is temporarily not serving data", and the verify script kept the
// old string - so a genuine block counted as four failures and the badge went
// red on a healthy service. Both spellings are matched, and any future
// rewording is caught by the fallback below rather than silently missed.
const BLOCKED_PREFIXES = ["Digikala is temporarily not serving data", "Digikala's CDN keeps asking"];

let id = 1;
async function rpc(method, params = {}) {
  const body = { jsonrpc: "2.0", id: id++, method, params };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...UA },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  // Streamable HTTP answers as SSE; the JSON payload rides in data: lines.
  const payload = text
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter(Boolean)
    .at(-1) ?? text;
  return JSON.parse(payload);
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
}

// An upstream block is information, not a failure: the worker answered
// correctly, Digikala just refused the region for now. Matched on the two
// known phrasings, plus the shape they share - a message that blames
// Digikala's side and asks the caller to retry in about a minute - so a
// future rewording is still read as a block instead of four red checks.
function blockedText(t) {
  if (typeof t !== "string") return false;
  if (BLOCKED_PREFIXES.some((p) => t.startsWith(p))) return true;
  return /^digikala\b/i.test(t) && /retry/i.test(t) && /rate|block|serving data|temporar|throttl/i.test(t);
}
function checkOrSkip(name, isBlocked, ok, detail = "") {
  if (isBlocked && !ok) {
    checks.push({ name, ok: true, detail: "SKIP - upstream blocked this run" });
    console.log(`${name} - SKIP (upstream blocked, worker answered correctly)`);
    return;
  }
  check(name, ok, detail);
}

// Retries one tools/call when the worker reports an upstream block.
// Sleeps are wall-clock time (CI pays ~a minute); the loop is bounded
// so a long outage still ends quickly instead of hanging the job.
async function callWithRetry(name, args, { tries = 3, waitMs = 30000 } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await rpc("tools/call", { name, arguments: args });
    const text = res.result?.content?.[0]?.text ?? "";
    if (!(res.result?.isError === true && blockedText(text))) return res;
    last = res;
    if (attempt < tries) await new Promise((r) => setTimeout(r, waitMs));
  }
  return last;
}

async function main() {
  // 0. Handshake.
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "verify-live", version: "1.0.0" },
  });
  check("handshake", !!init.result?.serverInfo, init.result?.serverInfo?.name ?? "");

  // 0b. Release drift. A stale build speaks perfectly valid MCP, so every other
  // check here stays green while the worker serves a version the docs left
  // behind - which is exactly how this service once ran two releases back
  // without anyone noticing. /health carries the version for this comparison,
  // and the newest CHANGELOG heading is what it is compared against.
  const health = await fetch(HEALTH, { headers: UA }).then((r) => r.json()).catch(() => ({}));
  const live = health.version ?? init.result?.serverInfo?.version ?? "unknown";
  const newest = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8").match(/^## (\d+\.\d+\.\d+)/m)?.[1];
  check(
    "live version matches the newest release in the CHANGELOG",
    !!newest && live === newest,
    `live=${live} changelog=${newest ?? "none"}`
  );

  await rpc("notifications/initialized", {});

  // 1. Tool list: expect the 16 public tools.
  const listed = await rpc("tools/list", {});
  const names = (listed.result?.tools ?? []).map((t) => t.name);
  check("tools/list returns 16 tools", names.length === 16, `${names.length} tools`);
  for (const must of ["search_digikala", "product_details", "product_price_chart", "find_best_value", "product_variants", "search_filters"]) {
    check(`tool present: ${must}`, names.includes(must));
  }
  const readonly = (listed.result?.tools ?? []).every((t) => t.annotations?.readOnlyHint === true);
  check("all tools read-only", readonly);

  // 2. Search: compact cards, toman prices, real URLs.
  const search = await callWithRetry("search_digikala", { query: "هدفون بی سیم", limit: 3 });
  const stext = search.result?.content?.[0]?.text ?? "";
  const sBlocked = search.result?.isError === true && blockedText(stext);
  let cards = [];
  try {
    cards = sBlocked ? [] : (JSON.parse(stext).items ?? []);
  } catch {
    cards = [];
  }
  checkOrSkip("search returns items", sBlocked, cards.length > 0, sBlocked ? "" : `${cards.length} items`);
  const first = cards[0] ?? {};
  checkOrSkip("card has toman price", sBlocked, typeof first.price_toman === "number", sBlocked ? "" : String(first.price_toman));
  checkOrSkip("card has product URL", sBlocked, typeof first.url === "string" && first.url.includes("digikala.com"), sBlocked ? "" : (first.url ?? ""));
  checkOrSkip("honest rating (null or number)", sBlocked, first.rating_stars === null || typeof first.rating_stars === "number");

  // 3. Details on a real id from search.
  if (first.id) {
    const details = await callWithRetry("product_details", { id: first.id });
    const dtext = details.result?.content?.[0]?.text ?? "";
    const dBlocked = details.result?.isError === true && blockedText(dtext);
    let title = "";
    try {
      title = dBlocked ? "" : String(JSON.parse(dtext).title ?? "");
    } catch {
      title = "";
    }
    checkOrSkip("details returns title", dBlocked, !!title, dBlocked ? "" : title.slice(0, 40));
  }

  // 4. Dead id: actionable error, not a crash.
  const dead = await rpc("tools/call", { name: "product_details", arguments: { id: 999999999 } });
  check("dead id is error", dead.result?.isError === true || !!dead.error);

  // 5. Unknown tool: named error listing available tools.
  const unknown = await rpc("tools/call", { name: "no_such_tool", arguments: {} });
  const utext = unknown.result?.content?.[0]?.text ?? unknown.error?.message ?? "";
  check("unknown tool names alternatives", utext.includes("search_digikala"), utext.slice(0, 60));

  const failed = checks.filter((c) => !c.ok);
  console.log(`\nVERIFY-DONE passed=${checks.length - failed.length} failed=${failed.length}`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error("VERIFY-ERROR", err.message);
  process.exitCode = 1;
});
