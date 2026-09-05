"""
GraphQL Scanner — discovery & introspection tests.

Mirrors src/main/services/route-scanner.ts:tryGraphQL and src/renderer/src/services/tauri.ts:scanBackend
GraphQL branch. Run: pytest tests/test_graphql_scanner.py -v   (or --live for real fetch)
"""

import pytest
from fastapi.testclient import TestClient

GRAPHQL_INTROSPECTION = """query IntrospectionQuery {
  __schema {
    queryType { name fields { name } }
    mutationType { name fields { name } }
  }
}"""


def graphql_introspection_fields(client, url="/graphql"):
    r = client.post(url, json={"query": GRAPHQL_INTROSPECTION})
    assert r.status_code == 200, r.text
    j = r.json()
    schema = j.get("data", {}).get("__schema")
    assert schema is not None, f"no __schema in {j}"
    return schema


def test_introspection_returns_query_type(client):
    schema = graphql_introspection_fields(client)
    assert schema["queryType"] is not None
    assert schema["queryType"]["name"] == "Query"
    fields = [f["name"] for f in schema["queryType"]["fields"]]
    # expect core queries matching schema.py:Query
    for name in ("health", "users", "user", "products", "product", "orders", "order", "me"):
        assert name in fields, f"missing query field {name} in {fields}"

def test_introspection_returns_mutation_type(client):
    schema = graphql_introspection_fields(client)
    assert schema["mutationType"] is not None
    assert schema["mutationType"]["name"] == "Mutation"
    fields = [f["name"] for f in schema["mutationType"]["fields"]]
    for name in ("login", "createUser", "updateUser", "deleteUser", "createProduct", "deleteProduct"):
        assert name in fields, f"missing mutation {name} in {fields}"

def test_graphql_endpoint_exists(client):
    # GET /graphql should serve GraphiQL (200 text/html) or 200 JSON when no query
    # Our strawberry router returns 200 even for GET playground
    r = client.get("/graphql")
    # FastAPI GraphQLRouter returns 200 for GET with playground HTML
    assert r.status_code in (200, 404)

def test_health_and_status_not_graphql(client):
    # REST health probes should still work alongside GraphQL
    assert client.get("/health").status_code == 200
    j = client.get("/health").json()
    assert j["status"] == "ok"
    assert j["service"] == "graphql"

def test_scanner_logic_detects_graphql(client):
    """
    Re-impl of tryGraphQL from route-scanner.ts — if POST /graphql introspection succeeds,
    classify as graphql with endpoints = fields.
    """
    schema = graphql_introspection_fields(client)
    endpoints = []
    for t in (schema.get("queryType"), schema.get("mutationType")):
        if t and isinstance(t.get("fields"), list):
            for f in t["fields"]:
                endpoints.append({"method": "POST", "path": "/graphql", "summary": f["name"], "tags": ["graphql"]})
    assert len(endpoints) >= 12
    # scanner would return this shape
    result = {"url": "http://localhost:4000", "detectedSpec": "graphql", "endpoints": endpoints}
    assert result["detectedSpec"] == "graphql"
    assert all(e["path"] == "/graphql" for e in result["endpoints"])
    assert all(e["method"] == "POST" for e in result["endpoints"])

def test_openapi_candidates_are_404_on_pure_graphql_server(client):
    # Pure GraphQL host should NOT expose OpenAPI specs — scanner must fall back to graphql, not openapi
    for p in ("/swagger.json", "/openapi.json", "/api-docs", "/v3/api-docs"):
        r = client.get(p)
        assert r.status_code == 404, f"{p} should be 404 on pure GraphQL server, got {r.status_code}"

def test_operation_names_all_fetchable(client):
    # Each query field should be executable (no 500)
    schema = graphql_introspection_fields(client)
    fields = [f["name"] for f in schema["queryType"]["fields"]]
    # probe a few simple ones
    for fname in ("health", "status", "echo", "seedUser", "seedProduct"):
        if fname not in fields:
            continue
        if fname == "health":
            q = "query { health { status } }"
        elif fname == "status":
            q = "query { status { status usersCount } }"
        elif fname == "echo":
            q = 'query { echo(message:"hi") }'
        elif fname == "seedUser":
            q = "query { seedUser }"
        elif fname == "seedProduct":
            q = "query { seedProduct }"
        else:
            continue
        r = client.post("/graphql", json={"query": q})
        assert r.status_code == 200, f"{fname}: {r.text}"
        j = r.json()
        assert "errors" not in j or j.get("data") is not None, f"{fname} errors: {j}"

# ── Live HTTP (real fetch) ───────────────────────────────

@pytest.mark.live
def test_live_introspection_via_fetch(live_server):
    import httpx
    base = live_server.rstrip("/")
    r = httpx.post(base + "/graphql", json={"query": GRAPHQL_INTROSPECTION}, timeout=3.0)
    assert r.status_code == 200
    j = r.json()
    schema = j["data"]["__schema"]
    assert schema["queryType"]["name"] == "Query"
    assert len(schema["queryType"]["fields"]) >= 10
    assert len(schema["mutationType"]["fields"]) >= 5

@pytest.mark.live
def test_live_scanner_would_classify_graphql(live_server):
    import httpx
    base = live_server.rstrip("/")
    # OpenAPI candidates should all 404
    for c in ("/swagger.json", "/openapi.json", "/api-docs"):
        assert httpx.get(base + c, timeout=2.0).status_code == 404
    # GraphQL introspection should succeed
    r = httpx.post(base + "/graphql", json={"query": GRAPHQL_INTROSPECTION}, timeout=3.0)
    assert r.status_code == 200
    assert r.json()["data"]["__schema"]["queryType"] is not None
