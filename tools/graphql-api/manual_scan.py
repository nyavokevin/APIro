"""
Manual GraphQL scanner — reproduces exactly what APIForge Route Scanner does for GraphQL.

Usage:
  python manual_scan.py                        # uses http://localhost:4000
  python manual_scan.py http://localhost:4000
"""

import sys
import json
import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000"
OPENAPI_CANDIDATES = ["/swagger.json", "/openapi.json", "/api-docs", "/v3/api-docs", "/swagger/v1/swagger.json"]
GRAPHQL_INTROSPECTION = """query IntrospectionQuery {
  __schema {
    queryType { name fields { name } }
    mutationType { name fields { name } }
  }
}"""

def scan(base: str):
    base = base.rstrip("/")
    print(f"Scanning {base} ...\n")

    # 1. Try OpenAPI candidates (same as route-scanner.ts:trySpecs)
    print("Phase 1 — OpenAPI probes:")
    for c in OPENAPI_CANDIDATES:
        url = base + c
        print(f"  GET {url} ... ", end="", flush=True)
        try:
            r = httpx.get(url, timeout=3.0)
            print(f"{r.status_code}", end="")
            if r.status_code == 200:
                try:
                    j = r.json()
                except Exception:
                    print(" (not json)")
                    continue
                if j.get("openapi") or j.get("swagger") or j.get("paths"):
                    print(f"  HIT -> {('openapi' if j.get('openapi') else 'swagger')}")
                    return "openapi"
                else:
                    print(" (no spec keys)")
            else:
                print()
        except Exception as e:
            print(f" error: {e}")

    print("  No OpenAPI hit -> falling back to GraphQL\n")

    # 2. Try GraphQL introspection (same as route-scanner.ts:tryGraphQL)
    url = base + "/graphql"
    print(f"Phase 2 -- GraphQL introspection POST {url}")
    print(f"  Query: {GRAPHQL_INTROSPECTION[:80]}...\n")
    try:
        r = httpx.post(url, json={"query": GRAPHQL_INTROSPECTION}, timeout=5.0)
        print(f"  Status: {r.status_code}")
        if r.status_code != 200:
            print(f"  Body: {r.text[:500]}")
            print("\n[X] GraphQL introspection failed")
            return "none"
        j = r.json()
        if j.get("errors"):
            print(f"  GraphQL errors: {j['errors']}")
        schema = j.get("data", {}).get("__schema")
        if not schema:
            print(f"  No __schema in response: {json.dumps(j)[:800]}")
            print("\n[X] Not a GraphQL endpoint")
            return "none"
        print(f"  queryType: {schema.get('queryType', {}).get('name')}")
        print(f"  mutationType: {schema.get('mutationType', {}).get('name')}")
        endpoints = []
        for t in (schema.get("queryType"), schema.get("mutationType")):
            if t and isinstance(t.get("fields"), list):
                for f in t["fields"]:
                    endpoints.append(f"POST      /graphql  {f['name']}")
        print(f"\n[OK] Matched POST /graphql -> graphql with {len(endpoints)} operations:\n")
        for ep in sorted(endpoints):
            print("  ", ep)
        print("\n--- Full introspection reply (truncated) ---")
        print(json.dumps(j, indent=2)[:1200])
        return "graphql"
    except Exception as e:
        print(f"  error: {e}")
        return "none"


if __name__ == "__main__":
    try:
        httpx.get(BASE.rstrip("/") + "/health", timeout=1.0)
    except Exception:
        print(f"Backend not reachable at {BASE}/health")
        print("Start it first:  $env:PORT=4000; python -m backend.app  (from tools/graphql-api)")
        sys.exit(1)
    spec = scan(BASE)
    print(f"\nDetectedSpec: {spec}")
