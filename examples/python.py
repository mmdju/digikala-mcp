"""Minimal client for the hosted Digikala MCP service (stdlib only).

No install: python examples/python.py

Talks Streamable HTTP the same way verify-live.mjs does: initialize,
list tools, call search_digikala + product_details, print compact cards.
Copy it into your own project and adapt freely (MIT).
"""
import json
import os
import sys
import urllib.request

ENDPOINT = os.environ.get("DIGIKALA_MCP_URL", "https://digikala-mcp.mmdju.workers.dev/mcp")


def rpc(method, params=None, rid=1):
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
    with urllib.request.urlopen(req, timeout=30) as res:
        text = res.read().decode("utf-8", "replace")
    payload = next(
        (line[5:].strip() for line in reversed(text.splitlines()) if line.startswith("data:")),
        text,
    )
    return json.loads(payload)


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
    init = rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                              "clientInfo": {"name": "py-client", "version": "1.0.0"}})
    print("server:", init["result"]["serverInfo"]["name"], init["result"]["serverInfo"]["version"])
    rpc("notifications/initialized", {}, rid=2)

    tools = rpc("tools/list", {}, rid=3)["result"]["tools"]
    print(f"tools: {len(tools)}")

    search = rpc("tools/call", {"name": "search_digikala",
                                "arguments": {"query": "هدفون بی سیم", "limit": 3}}, rid=4)
    items = json.loads(search["result"]["content"][0]["text"])["items"]
    for card in items:
        card_text(card)

    first_id = items[0]["id"]
    details = rpc("tools/call", {"name": "product_details",
                                 "arguments": {"id": first_id, "include_specs": False}}, rid=5)
    data = json.loads(details["result"]["content"][0]["text"])
    seller = (data.get("seller") or {}).get("name")
    print(f"details id={data.get('id')} | seller: {seller} | warranty ok: {bool(data.get('warranty'))}")


if __name__ == "__main__":
    main()
