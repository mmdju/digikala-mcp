# Security Policy

Digikala MCP is a read-only public service. There is nothing to log in to and no user data is stored.

- All 19 tools are read-only. No tool can change, delete or publish anything.
- No API keys are needed to use the hosted endpoint.
- Nothing about you is persisted. The state the service keeps: a short-lived cache of upstream responses plus Digikala's own CDN bot-check cookie (10 minutes), both scoped to the data centre handling the request and never readable from another one; and a small D1 table holding one row per *upstream failure* - tool name, error kind, status, request path and product id, never your query, your IP or a product title, with rows pruned after 30 days. The one piece of per-client state is the abuse-protection counter behind the 20-requests-per-minute-per-IP limit on POST /mcp, kept by Cloudflare's rate limiting service per data centre - no IPs, keys or usage history are stored or readable.
- Data comes from Digikala's public web API, which is undocumented and can change without notice. This project is not affiliated with or endorsed by Digikala.

## Reporting a Vulnerability

Please do NOT open a public issue. Report privately via the
[Security tab](../../security/advisories/new)
(Advisories → Report a vulnerability).
