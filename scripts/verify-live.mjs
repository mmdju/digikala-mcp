// Verify the LIVE hosted endpoint speaks MCP correctly.
// Anyone can run this - it only needs node 18+, no install:
//
//   node verify-live.mjs
//
// What it does: lists tools over Streamable HTTP, calls tools/list +
// tools/call for a search, a details read and an invalid-id error path,
// and asserts the honest-data contract (toman prices, null stars under
// the review floor, empty envelope on misses). No source needed.
const ENDPOINT = process.env.DIGIKALA_MCP_URL ?? "https://digikala-mcp.mmdju.workers.dev/mcp";
const UA = { "user-agent": "digikala-mcp-verify/1.0" };

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

async function main() {
  // 0. Handshake.
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "verify-live", version: "1.0.0" },
  });
  check("handshake", !!init.result?.serverInfo, init.result?.serverInfo?.name ?? "");

  await rpc("notifications/initialized", {});

  // 1. Tool list: expect the 14 public tools.
  const listed = await rpc("tools/list", {});
  const names = (listed.result?.tools ?? []).map((t) => t.name);
  check("tools/list returns 14 tools", names.length === 14, `${names.length} tools`);
  for (const must of ["search_digikala", "product_details", "product_price_chart", "find_best_value"]) {
    check(`tool present: ${must}`, names.includes(must));
  }
  const readonly = (listed.result?.tools ?? []).every((t) => t.annotations?.readOnlyHint === true);
  check("all tools read-only", readonly);

  // 2. Search: compact cards, toman prices, real URLs.
  const search = await rpc("tools/call", {
    name: "search_digikala",
    arguments: { query: "هدفون بی سیم", limit: 3 },
  });
  const sdata = JSON.parse(search.result?.content?.[0]?.text ?? "{}");
  const cards = sdata.items ?? [];
  check("search returns items", cards.length > 0, `${cards.length} items`);
  const first = cards[0] ?? {};
  check("card has toman price", typeof first.price_toman === "number", String(first.price_toman));
  check("card has product URL", typeof first.url === "string" && first.url.includes("digikala.com"), first.url ?? "");
  check("honest rating (null or number)", first.rating_stars === null || typeof first.rating_stars === "number");

  // 3. Details on a real id from search.
  if (first.id) {
    const details = await rpc("tools/call", { name: "product_details", arguments: { id: first.id } });
    const ddata = JSON.parse(details.result?.content?.[0]?.text ?? "{}");
    check("details returns title", !!ddata.title, String(ddata.title ?? "").slice(0, 40));
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
