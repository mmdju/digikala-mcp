// digikala-mcp (Node): stdio by default, Streamable HTTP with --http.
import { createServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { PORT } from "./config.js";
import { buildServer } from "./server.js";

async function main() {
  if (process.argv.includes("--http")) {
    // Stateless: every POST is self-contained. The SDK requires a fresh
    // transport (and therefore a fresh Server) per request.
    const http = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/mcp") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          const reqServer = buildServer();
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
          try {
            await reqServer.connect(transport);
            await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
          } catch {
            if (!res.headersSent) res.writeHead(400).end("Bad request");
          } finally {
            try { await transport.close(); } catch { /* ignore */ }
            try { await reqServer.close(); } catch { /* ignore */ }
          }
        });
      } else if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true,"service":"digikala-mcp"}');
      } else {
        res.writeHead(404).end("Not found. POST /mcp for MCP, GET /health for health.");
      }
    });
    http.listen(PORT, () => console.error(`digikala-mcp HTTP on :${PORT}/mcp`));
  } else {
    await buildServer().connect(new StdioServerTransport());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});