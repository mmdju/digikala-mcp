# Security Policy

Digikala MCP is a read-only public service. There is nothing to log in to and no user data is stored.

- All 16 tools are read-only. No tool can change, delete or publish anything.
- No API keys are needed to use the hosted endpoint.
- Nothing is persisted server-side. The only state is a short-lived cache of upstream responses plus Digikala's own CDN bot-check cookie (10 minutes), both scoped to the data centre handling the request and never readable from another one. There is no request counter and no client-side throttling.
- Data comes from Digikala's public web API, which is undocumented and can change without notice. This project is not affiliated with or endorsed by Digikala.

## Reporting a Vulnerability

Please do NOT open a public issue. Report privately via the
[Security tab](../../security/advisories/new)
(Advisories → Report a vulnerability).
