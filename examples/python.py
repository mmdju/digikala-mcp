"""Minimal client for the hosted Digikala MCP service (stdlib only).

No install: python examples/python.py

Talks Streamable HTTP the same way verify-live.mjs does: initialize,
list tools, call search_digikala + product_details, print compact cards.
Copy it into your own project and adapt freely (MIT).
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ENDPOINT = os.environ.get("DIGIKALA_MCP_URL", "https://digikala-mcp.mmdju.workers.dev/mcp")

# Prefixes the worker uses to say "upstream refused this region", newest
# first; both ask the caller to retry in a moment.
BLOCKED_PREFIXES = (
    "Digikala is temporarily not serving data",
    "Digikala's CDN keeps asking",
)


class McpError(Exception):
    """The call failed; str() is safe to show the user."""


def rpc(method, params=None, rid=1, timeout=30):
    body = json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
            "user-agent": "digikala-mcp-client/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            text = res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            hint = e.headers.get("Retry-After")
            raise McpError(f"rate limited (HTTP 429), retry after {hint or '?'}s")
        raise McpError(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}")
    payload = next(
        (line[5:].strip() for line in reversed(text.splitlines()) if line.startswith("data:")),
        text,
    )
    return json.loads(payload)


def call_tool(name, arguments, rid, tries=3, wait=20):
    """Call one tool, riding out transient upstream CDN blocks."""
    last_error = "unknown error"
    for attempt in range(1, tries + 1):
        res = rpc("tools/call", {"name": name, "arguments": arguments}, rid=rid)
        result = res.get("result") or {}
        if res.get("error"):
            raise McpError(str(res["error"].get("message", res["error"]))[:200])
        content = result.get("content") or []
        text = content[0].get("text", "") if content else ""
        if result.get("isError") is True:
            if text.startswith(BLOCKED_PREFIXES):
                last_error = text[:120]
                if attempt < tries:
                    time.sleep(wait)
                    continue
                raise McpError(f"upstream still blocked after {tries} tries: {last_error}")
            raise McpError(text[:200] or "tool returned isError with no message")
        return json.loads(text)
    raise McpError(last_error)


def card_text(card):
    price = f"{card.get('price_toman'):,} Toman" if card.get("price_toman") else "no price"
    stars = card.get("rating_stars")
    rating = f"{stars}/5 ({card.get('rating_count')} votes)" if stars is not None else "unrated"
    title = card.get("title") or ""
    print(f"- {title} | {price} | {rating}")
    print(f"  {card.get('url')}")


def main():
    # Windows consoles default to cp1252 - Persian titles need UTF-8.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    try:
        init = rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                                  "clientInfo": {"name": "py-client", "version": "1.0.0"}})
        server = (init.get("result") or {}).get("serverInfo") or {}
        print("server:", server.get("name", "?"), server.get("version", "?"))
        rpc("notifications/initialized", {}, rid=2)

        tools = rpc("tools/list", {}, rid=3).get("result", {}).get("tools", [])
        print(f"tools: {len(tools)}")

        search = call_tool("search_digikala",
                           {"query": "هدفون بی سیم", "limit": 3}, rid=4)
        if search.get("low_confidence"):
            print(f"note: low confidence, unmatched: {search.get('unmatched_terms')}")
        items = search.get("items") or []
        if not items:
            print("no items matched the query.")
            return
        for card in items:
            card_text(card)

        first_id = items[0].get("id")
        if first_id is None:
            print("first card has no id, skipping details.")
            return
        data = call_tool("product_details",
                         {"id": first_id, "include_specs": False}, rid=5)
        seller = (data.get("seller") or {}).get("name")
        print(f"details id={data.get('id')} | seller: {seller} | warranty ok: {bool(data.get('warranty'))}")
    except McpError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
