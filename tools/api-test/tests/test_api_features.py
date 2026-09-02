"""
Broad feature coverage for APIForge Test Backend.
All tests use TestClient (in-process) so they run without a live server.
"""

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

def test_system_status(client):
    r = client.get("/v1/status")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "healthy"
    assert j["users_count"] >= 20
    assert j["products_count"] >= 50

def test_docs_available(client):
    r = client.get("/docs")
    assert r.status_code == 200
    assert "swagger" in r.text.lower() or "openapi" in r.text.lower()

# ── Auth ────────────────────────────────────────────────────────────────────

def test_login_and_me(client):
    r = client.post("/v1/auth/login", json={"email": "alice@example.com", "password": "secret123"})
    assert r.status_code == 201 or r.status_code == 200
    j = r.json()
    token = j["token"]
    assert token.startswith("eyJ")

    r2 = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()["email"] == "alice@example.com"

def test_login_invalid_email(client):
    r = client.post("/v1/auth/login", json={"email": "not-an-email", "password": "x"})
    assert r.status_code == 400

def test_me_without_token_401(client):
    r = client.get("/v1/auth/me", headers={"Authorization": "Bearer invalid"})
    assert r.status_code == 401

# ── Users CRUD ──────────────────────────────────────────────────────────────

def test_list_users_pagination(client):
    r = client.get("/v1/users?page=1&limit=5")
    assert r.status_code == 200
    j = r.json()
    assert len(j["data"]) == 5
    assert j["pagination"]["total"] >= 20

def test_search_users(client):
    r = client.get("/v1/users?search=User 1")
    assert r.status_code == 200
    assert any("User 1" in u["name"] for u in r.json()["data"])

def test_create_update_delete_user(client):
    r = client.post("/v1/users", json={"name": "Test User", "email": "testuser@example.com", "role": "user"})
    assert r.status_code == 201
    uid = r.json()["id"]

    r2 = client.get(f"/v1/users/{uid}")
    assert r2.status_code == 200

    r3 = client.put(f"/v1/users/{uid}", json={"name": "Renamed"})
    assert r3.status_code == 200
    assert r3.json()["name"] == "Renamed"

    r4 = client.delete(f"/v1/users/{uid}")
    assert r4.status_code == 200
    assert client.get(f"/v1/users/{uid}").status_code == 404

# ── Products ────────────────────────────────────────────────────────────────

def test_list_products_filter(client):
    r = client.get("/v1/products?category=Electronics&limit=5")
    assert r.status_code == 200
    for p in r.json()["data"]:
        assert p["category"] == "Electronics"

def test_create_product(client):
    r = client.post("/v1/products", json={"name": "Test Product", "price": 9.99, "category": "Books", "stock": 10})
    assert r.status_code == 201
    assert r.json()["id"].startswith("SKU-")

# ── Orders ──────────────────────────────────────────────────────────────────

def test_list_orders(client):
    r = client.get("/v1/orders")
    assert r.status_code == 200
    assert "data" in r.json()

# ── HTML ────────────────────────────────────────────────────────────────────

def test_dashboard_html(client):
    r = client.get("/v1/dashboard")
    assert r.status_code == 200
    assert "<html>" in r.text
    assert "APIForge Dashboard" in r.text

# ── Upload/Download ─────────────────────────────────────────────────────────

def test_upload_and_download(client):
    r = client.post("/v1/upload", files={"file": ("hello.txt", b"hello world", "text/plain")})
    assert r.status_code == 200
    assert r.json()["filename"] == "hello.txt"

    r2 = client.get("/v1/download/sample")
    assert r2.status_code == 200
    assert "attachment" in r2.headers.get("content-disposition", "")

# ── Errors / Slow ───────────────────────────────────────────────────────────

def test_error_codes(client):
    for code in (400, 401, 403, 404, 422, 500, 503):
        r = client.get(f"/v1/errors/{code}")
        assert r.status_code == code, code

def test_slow_zero_delay(client):
    r = client.get("/v1/slow?delay=0")
    assert r.status_code == 200

# ── Seed ────────────────────────────────────────────────────────────────────

def test_seed_user(client):
    r = client.get("/v1/seed/user")
    assert r.status_code == 200
    assert "email" in r.json()
    assert "uuid" in r.json()

def test_seed_product(client):
    r = client.get("/v1/seed/product")
    assert r.status_code == 200
    assert "price" in r.json()
    assert "sku" in r.json()
