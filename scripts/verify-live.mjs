// Verify the LIVE hosted endpoint speaks MCP correctly.
// Anyone can run this - it only needs Node.js 18+, no install:
//
//   node verify-live.mjs
//
// The public check behind the hourly CI job: handshake, release version
// against this repo's CHANGELOG, the tool list, one search + details read,
// and the two error paths. It talks to the hosted endpoint only - no server
// source, no keys. Set DIGIKALA_MCP_URL to point it somewhere else.
//
// Flake policy: Digikala's CDN sometimes answers the CI region with a cookie
// challenge instead of data, and the worker then correctly reports an
// upstream block. Digikala refusing the region for a moment is not a broken
// server, so those checks report SKIP (exit 0) and only real contract
// violations report FAIL (exit 1). The workflow gives a failed run one retry
// after a cooldown, so this script stays single-shot on purpose.
import { readFileSync } from "node:fs";

const ENDPOINT = process.env.DIGIKALA_MCP_URL ?? "https://digikala-mcp.mmdju.workers.dev/mcp";
const HEALTH = ENDPOINT.replace(/\/mcp\/?$/, "/health");
const UA = { "user-agent": "digikala-mcp-verify/1.0" };

let nextId = 1;
async function rpc(method, params = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...UA },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  // Streamable HTTP answers as SSE; the JSON payload rides in data: lines.
  const payload =
    text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .at(-1) ?? text;
  return JSON.parse(payload);
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " - " + detail : ""}`);
}

// The service reports an upstream block as an error whose message starts
// with "Digikala" and asks the caller to retry shortly - that is Digikala
// refusing the region for a moment, not a broken server.
function isBlock(text) {
  return typeof text === "string" && /^digikala\b/i.test(text) && /retry/i.test(text);
}

function checkOrSkip(name, blocked, ok, detail = "") {
  if (blocked && !ok) {
    checks.push(true);
    console.log(`${name} - SKIP (upstream blocked this run, the worker answered correctly)`);
    return;
  }
  check(name, ok, detail);
}

// One tools/call response down to what the checks need: the message, and the
// parsed payload when the tool answered with JSON.
function readTool(res) {
  const text = res.result?.content?.[0]?.text ?? "";
  const blocked = res.result?.isError === true && isBlock(text);
  if (blocked) return { blocked, text, doc: null };
  try {
    return { blocked, text, doc: JSON.parse(text) };
  } catch {
    return { blocked, text, doc: null };
  }
}

async function main() {
  // Hello.
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "verify-live", version: "1.0.0" },
  });
  const server = init.result?.serverInfo ?? {};
  check("handshake", !!server.name, `${server.name ?? "?"} ${server.version ?? "?"}`);
  await rpc("notifications/initialized", {});

  // Release drift: a stale build speaks perfect MCP, so every other check can
  // stay green while the worker serves a release the docs left behind. The
  // version /health reports is compared against the newest heading in this
  // repo's CHANGELOG.
  const health = await fetch(HEALTH, { headers: UA }).then((r) => r.json()).catch(() => ({}));
  const live = health.version ?? server.version ?? "unknown";
  const newest = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8").match(/^## (\d+\.\d+\.\d+)/m)?.[1];
  check("live version is the newest CHANGELOG release", !!newest && live === newest, `live=${live} changelog=${newest ?? "none"}`);

  // The tool list: the count the README advertises, and the read-only promise.
  const tools = (await rpc("tools/list", {})).result?.tools ?? [];
  check("tools/list returns 19 tools", tools.length === 19, `${tools.length} tools`);
  check("all tools are read-only", tools.length > 0 && tools.every((t) => t.annotations?.readOnlyHint === true));

  // A real search, and the honesty the README promises: toman prices and a
  // rating that is a number or an explicit null.
  const search = readTool(
    await rpc("tools/call", { name: "search_digikala", arguments: { query: "هدفون بی سیم", limit: 3 } })
  );
  const cards = search.doc?.items ?? [];
  checkOrSkip(
    "search returns items",
    search.blocked,
    cards.length > 0,
    search.blocked ? "" : cards.length ? `${cards.length} items` : (search.text || "no items").slice(0, 120)
  );
  const first = cards[0] ?? {};
  checkOrSkip("card carries a toman price", search.blocked, typeof first.price_toman === "number", search.blocked ? "" : String(first.price_toman));
  checkOrSkip(
    "card carries a product URL",
    search.blocked,
    typeof first.url === "string" && first.url.includes("digikala.com"),
    search.blocked ? "" : first.url ?? ""
  );
  checkOrSkip("rating is a number or an explicit null", search.blocked, first.rating_stars === null || typeof first.rating_stars === "number");

  // The same product one level deeper.
  if (first.id) {
    const details = readTool(await rpc("tools/call", { name: "product_details", arguments: { id: first.id } }));
    checkOrSkip("details returns a title", details.blocked, !!details.doc?.title, details.blocked ? "" : String(details.doc?.title ?? "").slice(0, 40));
  }

  // Error paths: a dead id and an unknown tool both answer with a message,
  // not a crash.
  const dead = await rpc("tools/call", { name: "product_details", arguments: { id: 999999999 } });
  check("dead id answers as an error", dead.result?.isError === true || !!dead.error);
  const unknown = await rpc("tools/call", { name: "no_such_tool", arguments: {} });
  const unknownText = unknown.result?.content?.[0]?.text ?? unknown.error?.message ?? "";
  check("unknown tool names an available one", unknownText.includes("search_digikala"), unknownText.slice(0, 60));

  const failed = checks.filter((ok) => !ok).length;
  console.log(`\nLIVE-VERIFY passed=${checks.length - failed} failed=${failed}`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("LIVE-VERIFY-ERROR", err.message);
  process.exitCode = 1;
});
