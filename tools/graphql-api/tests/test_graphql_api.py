"""
GraphQL API feature tests — CRUD / auth / errors / pagination / slow
Mirrors tools/api-test/tests/test_api_features.py but for GraphQL operations.
"""
import pytest

def gql(client, query, variables=None, headers=None):
    payload = {"query": query}
    if variables is not None:
        payload["variables"] = variables
    r = client.post("/graphql", json=payload, headers=headers or {})
    return r

# ── Health / status ───────────────────────────────────────

def test_health_query(client):
    r = gql(client, "query { health { status version } }")
    assert r.status_code == 200
    data = r.json()["data"]["health"]
    assert data["status"] == "ok"

def test_status_query(client):
    r = gql(client, "query { status { status usersCount productsCount } }")
    assert r.status_code == 200
    d = r.json()["data"]["status"]
    assert d["status"] == "healthy"
    assert d["usersCount"] >= 20

# ── Users ─────────────────────────────────────────────────

def test_users_pagination(client):
    r = gql(client, "query { users(page:1 limit:5) { data { id name email } pagination { total pages } } }")
    assert r.status_code == 200
    j = r.json()
    assert "errors" not in j
    d = j["data"]["users"]
    assert len(d["data"]) == 5
    assert d["pagination"]["total"] >= 20

def test_users_filter_by_role(client):
    r = gql(client, 'query { users(page:1 limit:50 role:"admin") { data { role } } }')
    assert r.status_code == 200
    for u in r.json()["data"]["users"]["data"]:
        assert u["role"] == "admin"

def test_user_by_id(client):
    # first get a user id
    r = gql(client, "query { users(page:1 limit:1) { data { id } } }")
    uid = r.json()["data"]["users"]["data"][0]["id"]
    r2 = gql(client, f'query {{ user(id:"{uid}") {{ id name email }} }}')
    assert r2.status_code == 200
    assert r2.json()["data"]["user"]["id"] == uid

def test_user_not_found_returns_error(client):
    r = gql(client, 'query { user(id:"00000000-0000-0000-0000-000000000000") { id } }')
    assert r.status_code == 200  # GraphQL returns 200 + errors array
    j = r.json()
    assert "errors" in j
    assert j["errors"][0]["extensions"]["code"] == "NOT_FOUND"

# ── Auth ──────────────────────────────────────────────────

def test_login_and_me(client):
    r = gql(client, 'mutation { login(email:"tester@example.com" password:"x") { token refreshToken expiresIn } }')
    assert r.status_code == 200
    token = r.json()["data"]["login"]["token"]
    assert token.startswith("eyJ")
    # me with bearer
    r2 = gql(client, "query { me { email name } }", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["data"]["me"]["email"] == "tester@example.com"
    # me without auth should error
    r3 = gql(client, "query { me { email } }")
    assert "errors" in r3.json()

def test_login_invalid_email(client):
    r = gql(client, 'mutation { login(email:"not-an-email" password:"x") { token } }')
    assert "errors" in r.json()
    assert r.json()["errors"][0]["extensions"]["code"] == "BAD_USER_INPUT"

# ── Create / Update / Delete ──────────────────────────────

def test_create_update_delete_user_flow(client):
    # create
    r = gql(client, 'mutation { createUser(input:{name:"Ada Lovelace" email:"ada@example.com" role:"admin"}) { id name email role } }')
    assert r.status_code == 200
    j = r.json()
    assert "errors" not in j, j
    uid = j["data"]["createUser"]["id"]
    assert j["data"]["createUser"]["email"] == "ada@example.com"
    # update
    r2 = gql(client, f'mutation {{ updateUser(id:"{uid}" input:{{name:"AdaUpdated"}}) {{ id name }} }}')
    assert r2.json()["data"]["updateUser"]["name"] == "AdaUpdated"
    # delete
    r3 = gql(client, f'mutation {{ deleteUser(id:"{uid}") }}')
    assert r3.json()["data"]["deleteUser"] == uid
    # verify deleted
    r4 = gql(client, f'query {{ user(id:"{uid}") {{ id }} }}')
    assert "errors" in r4.json()

def test_create_product_and_list(client):
    r = gql(client, 'mutation { createProduct(input:{name:"TestWidget" price:42.5 category:"Electronics" stock:10}) { id name price } }')
    assert r.status_code == 200
    pid = r.json()["data"]["createProduct"]["id"]
    assert pid.startswith("SKU-")
    # list contains it
    r2 = gql(client, 'query { products(page:1 limit:100) { data { id } } }')
    ids = [p["id"] for p in r2.json()["data"]["products"]["data"]]
    assert pid in ids
    # delete
    r3 = gql(client, f'mutation {{ deleteProduct(id:"{pid}") }}')
    assert r3.json()["data"]["deleteProduct"] == pid

def test_products_filter(client):
    r = gql(client, 'query { products(page:1 limit:10 category:"Books") { data { category } } }')
    for p in r.json()["data"]["products"]["data"]:
        assert p["category"].lower() == "books"

# ── Errors ─────────────────────────────────────────────────

def test_error_test_query(client):
    for code, expect in [(400, "BAD_USER_INPUT"), (401, "UNAUTHENTICATED"), (404, "NOT_FOUND")]:
        r = gql(client, f"query {{ errorTest(code:{code}) }}")
        j = r.json()
        assert "errors" in j, f"code {code} missing errors: {j}"
        assert j["errors"][0]["extensions"]["code"] == expect

# ── Orders / seed ──────────────────────────────────────────

def test_orders_query(client):
    r = gql(client, "query { orders(page:1 limit:5) { data { id status total } pagination { total } } }")
    assert r.status_code == 200
    assert r.json()["data"]["orders"]["pagination"]["total"] >= 10

def test_seed_queries(client):
    r = gql(client, "query { seedUser }")
    assert r.status_code == 200
    assert "name" in str(r.json()["data"]["seedUser"]) or "email" in str(r.json()["data"]["seedUser"] or "")
    r2 = gql(client, "query { seedProduct }")
    assert r2.status_code == 200

def test_slow_query(client):
    r = gql(client, "query { slow(delay:1) }")
    assert r.status_code == 200
    assert r.json()["data"]["slow"]["message"] is not None
