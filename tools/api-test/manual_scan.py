"""
Manual scanner — reproduces exactly what APIForge Route Scanner does.

Usage:
  python manual_scan.py                    # uses http://localhost:3000
  python manual_scan.py http://localhost:3000

Starts backend if not running (advises).
"""

import sys
import json
import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
CANDIDATES = ["/swagger.json", "/openapi.json", "/api-docs", "/v3/api-docs", "/swagger/v1/swagger.json"]

def scan(base: str):
    base = base.rstrip("/")
    print(f"Scanning {base} ...")
    print(f"Candidates: {CANDIDATES}\n")
    for c in CANDIDATES:
        url = base + c
        print(f"  GET {url} ... ", end="", flush=True)
        try:
            r = httpx.get(url, timeout=3.0)
            print(f"{r.status_code}", end="")
            if r.status_code == 200:
                try:
                    j = r.json()
                except Exception as e:
                    print(f"  JSON error: {e}")
                    continue
                has_spec = bool(j.get("openapi") or j.get("swagger") or j.get("paths"))
                spec_type = "openapi" if j.get("openapi") else "swagger" if j.get("swagger") else ("inferred" if j.get("paths") else "none")
                print(f"  spec={spec_type}  paths={len(j.get('paths') or {})}")
                if has_spec:
                    print(f"\n✓ Matched {c} → {spec_type} with {len(j['paths'])} paths\n")
                    endpoints = []
                    for path, ops in (j.get("paths") or {}).items():
                        for m in ("get","post","put","patch","delete","head","options"):
                            if m in ops:
                                endpoints.append(f"{m.upper():7} {path}  {ops[m].get('summary','')}")
                    print(f"Endpoints ({len(endpoints)}):")
                    for ep in sorted(endpoints)[:40]:
                        print("  ", ep)
                    if len(endpoints) > 40:
                        print(f"  ... +{len(endpoints)-40} more")
                    print("\n--- RAW OpenAPI (first 800 chars) ---")
                    print(json.dumps(j, indent=2)[:800])
                    return j
            else:
                print()
        except Exception as e:
            print(f"error: {e}")
    print("\n✗ No spec found (detectedSpec=none)")
    return None

if __name__ == "__main__":
    try:
        httpx.get(BASE + "/health", timeout=1.0)
    except Exception:
        print(f"Backend not reachable at {BASE}/health")
        print("Start it first:  python backend/apiforge_test_backend.py")
        sys.exit(1)
    scan(BASE)
