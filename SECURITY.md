# Security Policy

## Reporting a Vulnerability

Please do NOT open a public issue. Report privately via the
[Security tab](../../security/advisories/new)
(Advisories → Report a vulnerability).

Notes:

- The server is read-only and needs no credentials. It holds no accounts,
  tokens or user data, and the hosted endpoint is keyless.
- Nothing is persisted server-side. The only state is a per-isolate response
  cache that other isolates cannot read.
- Data comes from Digikala's public web API, which is **undocumented and can
  change without notice**. This project is not affiliated with or endorsed by
  Digikala.
- If you self-host a public instance, put it behind a rate limit: an open
  endpoint can be abused to send traffic to Digikala from your egress.
