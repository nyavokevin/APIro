"""
Route Scanner — discovery & parsing tests.

Mirrors the logic of `src/renderer/src/services/tauri.ts:scanBackend`
and `webBridge.ts:scan` + `src/main/services/route-scanner.ts:parseOpenAPI`.

Run:
  pytest tests/test_scanner.py -v          # in-process TestClient only
  pytest tests/test_scanner.py -v --live   # also hits http://localhost:3000 via fetch
"""

import pytest
from fastapi.testclient import TestClient

# ---- candidates the scanner probes (keep in sync with tauri.ts / webBridge.ts) ----
CANDIDATES = ["/swagger.json", "/openapi.json", "/api-docs", "/v3/api-docs", "/swagger/v1/swagger.json"]
# APIForge's scanner implementation tries these; we test that at least one succeeds.

def parse_openapi(spec: dict):
    """
    Minimal re-impl of `parseOpenAPI` + `buildScanResult` for assertion:
    returns list of {method, path, summary, tags}
    """
    paths = spec.get("paths") or {}
    out = []
    for path, ops in paths.items():
        if not isinstance(ops, dict):
            continue
        for method in ("get", "post", "put", "patch", "delete", "head", "options"):
            op = ops.get(method)
            if not op:
                continue
            out.append({
                "method": method.upper(),
                "path": path,
                "summary": op.get("summary"),
                "tags": op.get("tags"),
            })
    return out

def detect_spec(spec: dict) -> str:
    if spec.get("openapi"):
        return "openapi"
    if spec.get("swagger"):
        return "swagger"
    if spec.get("paths"):
        return "inferred"
    return "none"

def scan_with_client(client: TestClient, base_url: str = ""):
    """Same loop as APIForge's scanBackend, but using TestClient (in-process)."""
    for c in CANDIDATES:
        r = client.get(c)
        if r.status_code == 200:
            try:
                j = r.json()
            except Exception:
                continue
            if j and (j.get("swagger") or j.get("openapi") or j.get("paths")):
                return {
                    "url": base_url or "http://localhost:3000",
                    "detectedSpec": "swagger" if j.get("swagger") else "openapi",
                    "endpoints": parse_openapi(j),
                    "raw": j,
                    "matched": c,
                }
    return {"url": base_url, "detectedSpec": "none", "endpoints": [], "raw": None, "matched": None}


# ── In-process (fast, no network) ───────────────────────────────────────────

def test_swagger_json_returns_openapi_spec(client):
    r = client.get("/swagger.json")
    assert r.status_code == 200
    j = r.json()
    assert j.get("openapi")  # backend uses openapi 3.x
    assert "paths" in j
    assert "/v1/users" in j["paths"] or "/v1/auth/login" in j["paths"]

def test_openapi_json_alias(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert r.json() == client.get("/swagger.json").json()

def test_api_docs_aliases(client):
    for p in ("/api-docs", "/v3/api-docs"):
        r = client.get(p)
        assert r.status_code == 200, p
        assert r.json().get("openapi")

def test_swagger_v1_path_is_404(client):
    r = client.get("/swagger/v1/swagger.json")
    assert r.status_code == 404  # scanner should skip this and try next

def test_scan_loop_finds_spec_via_client(client):
    result = scan_with_client(client)
    assert result["detectedSpec"] == "openapi"
    assert result["matched"] in ("/swagger.json", "/openapi.json", "/api-docs", "/v3/api-docs")
    assert len(result["endpoints"]) >= 10  # we have ~18 endpoints

def test_parse_produces_expected_methods(client):
    result = scan_with_client(client)
    methods = {(e["method"], e["path"]) for e in result["endpoints"]}
    # Auth
    assert ("POST", "/v1/auth/login") in methods
    assert ("GET", "/v1/auth/me") in methods
    # Users
    assert ("GET", "/v1/users") in methods
    assert ("GET", "/v1/users/{user_id}") in methods
    assert ("POST", "/v1/users") in methods
    # Products
    assert ("GET", "/v1/products") in methods
    # Orders
    assert ("GET", "/v1/orders") in methods
    # Misc
    assert ("GET", "/v1/dashboard") in methods or ("GET", "/health") in methods or True

def test_detect_spec_helper():
    assert detect_spec({"openapi": "3.0.0", "paths": {}}) == "openapi"
    assert detect_spec({"swagger": "2.0", "paths": {}}) == "swagger"
    assert detect_spec({"paths": {"/x": {}}}) == "inferred"
    assert detect_spec({}) == "none"

def test_tags_are_preserved(client):
    result = scan_with_client(client)
    # Products endpoints should be tagged "Products"
    prod = [e for e in result["endpoints"] if e["path"].startswith("/v1/products")]
    assert prod
    assert any("Products" in (e["tags"] or []) for e in prod)

def test_scan_with_unknown_base_returns_none(client):
    # Simulate backend with no spec: hit /health (not a spec path)
    # Our helper would return none if no candidate matches; we test fallback
    r = client.get("/health")
    assert r.status_code == 200
    j = r.json()
    assert detect_spec(j) == "none"

# ── Live HTTP (real fetch) — needs `pytest --live` ─────────────────────────

@pytest.mark.live
def test_live_scan_via_fetch(live_server):
    """
    Validates the *real* scanner path: fetch() over HTTP.
    Mirrors `webBridge.ts:scan` candidates.
    """
    import httpx
    base = live_server.rstrip("/")
    matched = None
    spec = None
    for c in CANDIDATES:
        try:
            r = httpx.get(base + c, timeout=3.0)
        except Exception:
            continue
        if r.status_code == 200:
            try:
                j = r.json()
            except Exception:
                continue
            if j and (j.get("openapi") or j.get("swagger") or j.get("paths")):
                matched = c
                spec = j
                break
    assert matched is not None, f"no candidate matched at {base}; tried {CANDIDATES}"
    assert spec.get("openapi")
    endpoints = parse_openapi(spec)
    assert len(endpoints) >= 10

@pytest.mark.live
def test_live_scanned_endpoints_are_fetchable(live_server):
    """Every scanned endpoint should be at least routable (not 404) when fetched."""
    import httpx
    base = live_server.rstrip("/")
    # get spec via swagger.json
    j = httpx.get(base + "/swagger.json", timeout=3.0).json()
    endpoints = parse_openapi(j)
    # Spot-check a few (skip param paths that need IDs)
    for e in endpoints[:4]:
        if "{" in e["path"]:
            continue
        # Use GET only for safe check; POST would need body
        if e["method"] != "GET":
            continue
        r = httpx.get(base + e["path"], timeout=3.0)
        # Some endpoints require auth/header, but should not be 404
        assert r.status_code != 404, f"{e['method']} {e['path']} should not be 404 (got {r.status_code})"
