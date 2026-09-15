// digikala-mcp (Cloudflare Workers): stateless Streamable HTTP at /mcp.
// Keyless, so there is nothing to wire per request beyond a fresh Server.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildServer } from "./server.js";

const LANDING = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>digikala-mcp - Digikala for AI agents</title></head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;line-height:1.9">
<h1>digikala-mcp</h1>
<p>جست‌وجو، مقایسه و قیمت کالاهای دیجی‌کالا برای دستیارهای هوشمند. بدون کلید API، فقط خواندنی.</p>
<p>۱۰ ابزار: جست‌وجو، دسته‌بندی، جزئیات کالا، دیدگاه‌ها، مقایسه، شگفت‌انگیزها، پرفروش‌ها و «بهترین خرید با بودجه».</p>
<p><b>MCP endpoint:</b> <code>POST /mcp</code> (Streamable HTTP, stateless, no auth)</p>
<p>قیمت‌ها به تومان و از API عمومی دیجی‌کالا؛ پیش از خرید در digikala.com تأیید کنید.</p>
</body></html>`;

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/mcp") {
      const server = buildServer();
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      try {
        await server.connect(transport);
        const res = await transport.handleRequest(req);
        // Plain text/event-stream decodes as latin-1 in naive clients
        // (PowerShell included) - the charset keeps Persian titles intact.
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("text/event-stream") && !ct.includes("charset")) {
          const headers = new Headers(res.headers);
          headers.set("content-type", `${ct}; charset=utf-8`);
          return new Response(res.body, { status: res.status, headers });
        }
        return res;
      } catch {
        try { await transport.close(); } catch { /* ignore */ }
        try { await server.close(); } catch { /* ignore */ }
        return new Response("Bad request", { status: 400 });
      }
    }
    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "digikala-mcp" });
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return new Response(LANDING, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found. POST /mcp for MCP.", { status: 404 });
  },
};