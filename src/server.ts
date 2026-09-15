// Shared MCP server factory: used by index.ts (Node transports) and
// worker.ts (Workers). No node: imports here - must stay portable.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { READ_ONLY, TOOLS } from "./tools.js";
import { UpstreamError } from "./http.js";

export const VERSION = "0.1.0";

// Server-level guidance: cheaper than repeating it in every tool description,
// and it steers the agent before it picks a tool at all.
const INSTRUCTIONS = [
  "Digikala (Iran's largest marketplace) product intelligence. Read-only, no API key needed.",
  "All prices are in Toman (1 Toman = 10 Rial) and change constantly - always link the product URL so the user can confirm.",
  "Pick the right entry point: digikala_suggest for vague wording or category ids, search_digikala to browse,",
  "find_best_value for any question with a budget or the word 'best', product_details for one item,",
  "compare_products for 2-5 items, product_reviews for opinions, incredible_offers for today's deals.",
  "Digikala returns ~700KB per search page; these tools return compact cards. Keep result limits small and narrow",
  "with only_marketable, min_rating and brand_ids instead of fetching many pages.",
].join(" ");

export function buildServer(): Server {
  const server = new Server(
    { name: "digikala-mcp", version: VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: { ...t.inputSchema, additionalProperties: false },
      annotations: READ_ONLY,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool '${req.params.name}'. Available: ${TOOLS.map((t) => t.name).join(", ")}.` }],
        isError: true,
      };
    }
    try {
      const args = (req.params.arguments || {}) as Record<string, unknown>;
      const data = await tool.run(args);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      const message =
        err instanceof UpstreamError
          ? err.message
          : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
      return { content: [{ type: "text", text: message }], isError: true };
    }
  });

  return server;
}