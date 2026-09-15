// Digikala public API probe: which endpoints are alive, how big the
// responses are, and what shape the data has. The server is built from
// what this prints - run it before changing any projection.
// Usage: npm run probe
const H = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.digikala.com/",
  "X-Web-Client-Id": "web",
  "X-Web-Client": "desktop",
  "X-Web-Optimize-Response": "1",
};

// DigiCDN answers with 307 + Set-Cookie: digicdn_cookie=... when it wants a
// client that keeps cookies (fetch keeps none). Harvest it and resend;
// without this every request looks like an infinite redirect loop.
let challengeCookie = null;

async function get(url) {
  const withCookie = (c) => ({ ...H, ...(c ? { Cookie: `digicdn_cookie=${c}` } : {}) });
  let res = await fetch(url, { headers: withCookie(challengeCookie), redirect: "manual" });
  if (res.status === 307 || res.status === 308) {
    const m = (res.headers.get("set-cookie") || "").match(/digicdn_cookie=([^;\s]+)/);
    if (m) {
      challengeCookie = m[1];
      res = await fetch(url, { headers: withCookie(challengeCookie), redirect: "manual" });
    }
  }
  return res;
}

const CASES = [
  ["autocomplete", "https://api.digikala.com/v1/autocomplete/?q=laptop"],
  ["search", "https://api.digikala.com/v1/search/?q=laptop"],
  ["search-page2", "https://api.digikala.com/v1/search/?q=laptop&page=2"],
  ["category-22", "https://api.digikala.com/v2/category/22/"],
  ["product-v2", "https://api.digikala.com/v2/product/15889042/"],
  ["comments", "https://api.digikala.com/v1/product/15889042/comments/"],
  ["recommendation", "https://api.digikala.com/v1/product/15889042/recommendation/"],
  ["tabular-recommendation", "https://api.digikala.com/v1/product/15889042/tabular-recommendation/"],
  ["incredible-offers", "https://api.digikala.com/v1/incredible-offers/"],
  ["best-selling", "https://api.digikala.com/v1/best-selling/"],
];

const kind = (v) =>
  Array.isArray(v) ? `array(${v.length})` : v === null ? "null" : typeof v;

function shape(o, prefix, out, depth, max) {
  if (!o || typeof o !== "object" || depth > max) return out;
  for (const [k, v] of Object.entries(o)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0]) {
      out.push(`${p}[] ${kind(v)} -> {${Object.keys(v[0]).slice(0, 45).join(",")}}`);
    } else if (v && typeof v === "object") {
      if (depth < max) shape(v, p, out, depth + 1, max);
      else out.push(`${p} ${kind(v)}`);
    } else {
      out.push(`${p} = ${JSON.stringify(v)?.slice(0, 60)}`);
    }
  }
  return out;
}

// Sequential probes add up to ~25s, so run them in a small pool instead.
// 4 in flight keeps us well under any polite-usage threshold.
const only = process.argv.slice(2);
const wanted = only.length
  ? CASES.filter(([n]) => only.some((o) => n.includes(o)))
  : CASES;

async function probeOne([name, url]) {
  const lines = [];
  try {
    const res = await get(url);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    lines.push(`\n=== ${name} | HTTP ${res.status} | ${text.length}B`);
    if (!json) {
      lines.push("  (not JSON)");
      return lines.join("\n");
    }
    const data = json.data ?? json;
    lines.push("  data keys: " + Object.keys(data).join(", "));
    for (const line of shape(data, "data", [], 0, 2).slice(0, 28))
      lines.push("  " + line);
  } catch (err) {
    lines.push(`\n=== ${name} | ERR | ${err.message}`);
  }
  return lines.join("\n");
}

const reports = new Array(wanted.length);
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(4, wanted.length) }, async () => {
    while (next < wanted.length) {
      const idx = next++;
      reports[idx] = await probeOne(wanted[idx]);
    }
  })
);
console.log(reports.join("\n"));
console.log("\nPROBE-DONE");
