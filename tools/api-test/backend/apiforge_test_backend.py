"""
APIForge Test Backend
A FastAPI server designed to test all APIForge features.
Based on patterns from public-apis/public-apis GitHub repo.

Run: python apiforge_test_backend.py
"""

from fastapi import FastAPI, HTTPException, Depends, Header, Query, File, UploadFile, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import uuid
import random
import string
import time
import json
import io

app = FastAPI(
    title="APIForge Test Backend",
    description="Mock API server for testing APIForge client features",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS -- allow APIForge to connect from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================
# IN-MEMORY DATABASES
# =============================================================

users_db: Dict[str, Dict] = {}
products_db: Dict[str, Dict] = {}
orders_db: Dict[str, Dict] = {}
tokens_db: Dict[str, Dict] = {}  # active tokens
api_keys_db: Dict[str, Dict] = {
    "dev_key_abc123_local": {"name": "Local Dev", "tier": "free"},
    "staging_key_xyz789": {"name": "Staging", "tier": "pro"},
    "prod_key_secret_001": {"name": "Production", "tier": "enterprise"},
}

# Seed initial data
def seed_data():
    for i in range(1, 21):
        uid = str(uuid.uuid4())
        users_db[uid] = {
            "id": uid,
            "name": f"User {i}",
            "email": f"user{i}@example.com",
            "role": random.choice(["admin", "user", "editor"]),
            "avatar": f"https://i.pravatar.cc/150?u={uid}",
            "created_at": (datetime.now() - timedelta(days=random.randint(1, 365))).isoformat(),
        }

    categories = ["Electronics", "Books", "Clothing", "Food", "Toys"]
    for i in range(1, 51):
        pid = f"SKU-{uuid.uuid4().hex[:8].upper()}"
        products_db[pid] = {
            "id": pid,
            "name": f"Product {i} -- {random.choice(categories)}",
            "price": round(random.uniform(5.0, 500.0), 2),
            "category": random.choice(categories),
            "stock": random.randint(0, 100),
            "rating": round(random.uniform(1.0, 5.0), 1),
            "description": f"This is a detailed description for product {i}.",
            "inStock": random.randint(0, 100) > 0,
        }

    for i in range(1, 11):
        oid = str(uuid.uuid4())
        user_id = random.choice(list(users_db.keys()))
        product_ids = random.sample(list(products_db.keys()), k=random.randint(1, 5))
        total = sum(products_db[p]["price"] for p in product_ids)
        orders_db[oid] = {
            "id": oid,
            "user_id": user_id,
            "products": product_ids,
            "total": round(total, 2),
            "status": random.choice(["pending", "shipped", "delivered", "cancelled"]),
            "created_at": (datetime.now() - timedelta(days=random.randint(1, 30))).isoformat(),
        }

seed_data()

# =============================================================
# AUTH & SECURITY
# =============================================================

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    token: str
    refreshToken: str
    expires_in: int
    token_type: str = "Bearer"

@app.post("/v1/auth/login", response_model=TokenResponse, tags=["Auth"])
def login(credentials: LoginRequest):
    """Authenticate and receive JWT-like token."""
    if "@" not in credentials.email:
        raise HTTPException(status_code=400, detail="Invalid email format")

    token = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{uuid.uuid4().hex}.{uuid.uuid4().hex}"
    refresh = f"refresh_{uuid.uuid4().hex}"

    tokens_db[token] = {
        "email": credentials.email,
        "created": datetime.now().isoformat(),
        "expires": (datetime.now() + timedelta(hours=1)).isoformat(),
    }

    return {
        "token": token,
        "refreshToken": refresh,
        "expires_in": 3600,
        "token_type": "Bearer",
    }

@app.post("/v1/auth/refresh", tags=["Auth"])
def refresh_token(refreshToken: str = Header(..., alias="X-Refresh-Token")):
    """Refresh an expired access token."""
    if not refreshToken.startswith("refresh_"):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    new_token = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{uuid.uuid4().hex}.{uuid.uuid4().hex}"
    return {"token": new_token, "expires_in": 3600}

@app.get("/v1/auth/me", tags=["Auth"])
def get_profile(authorization: str = Header(...)):
    """Get current user profile from Bearer token."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.replace("Bearer ", "").strip()
    if token not in tokens_db:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {
        "id": str(uuid.uuid4()),
        "email": tokens_db[token]["email"],
        "name": tokens_db[token]["email"].split("@")[0].title(),
        "role": "admin",
        "avatar": f"https://i.pravatar.cc/150?u={token[:16]}",
    }

# API Key dependency
def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if x_api_key not in api_keys_db:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_keys_db[x_api_key]

# =============================================================
# USERS CRUD
# =============================================================

class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., pattern=r"^[\w\.-]+@[\w\.-]+\.[a-zA-Z]{2,}$")
    role: str = Field(default="user", pattern=r"^(admin|user|editor)$")

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None

@app.get("/v1/users", tags=["Users"])
def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    role: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """List all users with pagination and filtering."""
    all_users = list(users_db.values())

    if role:
        all_users = [u for u in all_users if u["role"] == role]
    if search:
        all_users = [u for u in all_users if search.lower() in u["name"].lower() or search.lower() in u["email"].lower()]

    total = len(all_users)
    start = (page - 1) * limit
    end = start + limit
    paginated = all_users[start:end]

    return {
        "data": paginated,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit,
        },
    }

@app.get("/v1/users/{user_id}", tags=["Users"])
def get_user(user_id: str):
    """Get a single user by ID."""
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
    return users_db[user_id]

@app.post("/v1/users", status_code=201, tags=["Users"])
def create_user(user: UserCreate):
    """Create a new user."""
    uid = str(uuid.uuid4())
    users_db[uid] = {
        "id": uid,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "avatar": f"https://i.pravatar.cc/150?u={uid}",
        "created_at": datetime.now().isoformat(),
    }
    return users_db[uid]

@app.put("/v1/users/{user_id}", tags=["Users"])
def update_user(user_id: str, user: UserUpdate):
    """Update an existing user."""
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="User not found")

    if user.name:
        users_db[user_id]["name"] = user.name
    if user.email:
        users_db[user_id]["email"] = user.email
    if user.role:
        users_db[user_id]["role"] = user.role

    return users_db[user_id]

@app.delete("/v1/users/{user_id}", tags=["Users"])
def delete_user(user_id: str):
    """Delete a user."""
    if user_id not in users_db:
        raise HTTPException(status_code=404, detail="User not found")
    del users_db[user_id]
    return {"message": "User deleted", "id": user_id}

# =============================================================
# PRODUCTS
# =============================================================

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=2)
    price: float = Field(..., gt=0)
    category: str
    stock: int = Field(default=0, ge=0)
    description: Optional[str] = ""
    inStock: bool = True

@app.get("/v1/products", tags=["Products"])
def list_products(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    category: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None, ge=0),
    max_price: Optional[float] = Query(None, ge=0),
    in_stock: Optional[bool] = Query(None),
):
    """List products with filtering."""
    all_products = list(products_db.values())
    if category:
        all_products = [p for p in all_products if p["category"].lower() == category.lower()]
    if min_price is not None:
        all_products = [p for p in all_products if p["price"] >= min_price]
    if max_price is not None:
        all_products = [p for p in all_products if p["price"] <= max_price]
    if in_stock is not None:
        all_products = [p for p in all_products if p["inStock"] == in_stock]

    total = len(all_products)
    start = (page - 1) * limit
    return {
        "data": all_products[start:start+limit],
        "pagination": {"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) // limit},
    }

@app.get("/v1/products/{product_id}", tags=["Products"])
def get_product(product_id: str):
    if product_id not in products_db:
        raise HTTPException(status_code=404, detail="Product not found")
    return products_db[product_id]

@app.post("/v1/products", status_code=201, tags=["Products"])
def create_product(product: ProductCreate):
    pid = f"SKU-{uuid.uuid4().hex[:8].upper()}"
    products_db[pid] = {
        "id": pid,
        "name": product.name,
        "price": product.price,
        "category": product.category,
        "stock": product.stock,
        "description": product.description,
        "inStock": product.inStock and product.stock > 0,
        "rating": 0.0,
    }
    return products_db[pid]

@app.delete("/v1/products/{product_id}", tags=["Products"])
def delete_product(product_id: str):
    if product_id not in products_db:
        raise HTTPException(status_code=404, detail="Product not found")
    del products_db[product_id]
    return {"message": "Product deleted", "id": product_id}

# =============================================================
# ORDERS
# =============================================================

@app.get("/v1/orders", tags=["Orders"])
def list_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = Query(None),
):
    all_orders = list(orders_db.values())
    if status:
        all_orders = [o for o in all_orders if o["status"] == status]

    total = len(all_orders)
    start = (page - 1) * limit
    return {
        "data": all_orders[start:start+limit],
        "pagination": {"page": page, "limit": limit, "total": total},
    }

@app.get("/v1/orders/{order_id}", tags=["Orders"])
def get_order(order_id: str):
    if order_id not in orders_db:
        raise HTTPException(status_code=404, detail="Order not found")
    return orders_db[order_id]

# =============================================================
# HTML RESPONSE (for testing HTML renderer)
# =============================================================

@app.get("/v1/dashboard", response_class=HTMLResponse, tags=["HTML"])
def dashboard_html():
    """Returns an HTML page for testing the HTML renderer."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Inter, sans-serif; background: #0A0A0B; color: #E8E9ED; padding: 40px; }
            .card { background: #16171A; border: 1px solid #2A2B30; border-radius: 8px; padding: 24px; margin: 16px 0; }
            .badge { background: #6E8CFF20; color: #6E8CFF; padding: 4px 12px; border-radius: 4px; font-size: 12px; }
            h1 { color: #6E8CFF; }
            .metric { display: inline-block; margin-right: 32px; }
            .metric-value { font-size: 32px; font-weight: 700; color: #4ADE80; }
            .metric-label { font-size: 12px; color: #8A8B94; text-transform: uppercase; }
        </style>
    </head>
    <body>
        <h1>🚀 APIForge Dashboard</h1>
        <div class="card">
            <span class="badge">LIVE</span>
            <h2>System Status</h2>
            <div class="metric">
                <div class="metric-value">99.9%</div>
                <div class="metric-label">Uptime</div>
            </div>
            <div class="metric">
                <div class="metric-value">42ms</div>
                <div class="metric-label">Avg Response</div>
            </div>
            <div class="metric">
                <div class="metric-value">1,234</div>
                <div class="metric-label">Requests/min</div>
            </div>
        </div>
        <div class="card">
            <h2>Recent Activity</h2>
            <ul>
                <li>✅ Login successful -- admin@example.com</li>
                <li>✅ Product created -- SKU-ABC12345</li>
                <li>⚠️ Rate limit warning -- IP 192.168.1.1</li>
            </ul>
        </div>
    </body>
    </html>
    """

# =============================================================
# FILE UPLOAD / DOWNLOAD
# =============================================================

@app.post("/v1/upload", tags=["Files"])
def upload_file(file: UploadFile = File(...)):
    """Upload a file and return metadata."""
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(file.file.read()),
        "uploaded_at": datetime.now().isoformat(),
    }

@app.get("/v1/download/sample", tags=["Files"])
def download_sample():
    """Download a sample JSON file."""
    data = json.dumps({"message": "Hello from APIForge", "timestamp": datetime.now().isoformat()}, indent=2)
    return StreamingResponse(
        io.BytesIO(data.encode()),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=sample.json"},
    )

# =============================================================
# DELAY / TIMEOUT / ERROR TESTING
# =============================================================

@app.get("/v1/slow", tags=["Testing"])
def slow_response(delay: int = Query(2, ge=0, le=30)):
    """Returns after N seconds (test timeout settings)."""
    time.sleep(delay)
    return {"message": f"Response after {delay} seconds", "timestamp": datetime.now().isoformat()}

@app.get("/v1/errors/{code}", tags=["Testing"])
def trigger_error(code: int):
    """Trigger specific HTTP errors for testing."""
    if code == 400:
        raise HTTPException(status_code=400, detail="Bad Request -- malformed input")
    elif code == 401:
        raise HTTPException(status_code=401, detail="Unauthorized -- invalid token")
    elif code == 403:
        raise HTTPException(status_code=403, detail="Forbidden -- insufficient permissions")
    elif code == 404:
        raise HTTPException(status_code=404, detail="Not Found -- resource does not exist")
    elif code == 422:
        raise HTTPException(status_code=422, detail="Unprocessable Entity -- validation failed")
    elif code == 500:
        raise HTTPException(status_code=500, detail="Internal Server Error -- something went wrong")
    elif code == 503:
        raise HTTPException(status_code=503, detail="Service Unavailable -- retry after 30s")
    else:
        return {"message": f"Status {code} -- custom response"}

# =============================================================
# SEED / FAKER ENDPOINTS
# =============================================================

@app.get("/v1/seed/user", tags=["Seed"])
def seed_user():
    """Generate a fake user for testing seed data."""
    first = random.choice(["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank"])
    last = random.choice(["Smith", "Johnson", "Williams", "Brown", "Jones"])
    return {
        "name": f"{first} {last}",
        "email": f"{first.lower()}.{last.lower()}@example.com",
        "username": f"{first.lower()}_{last.lower()}_{random.randint(1, 999)}",
        "phone": f"+1-{random.randint(200, 999)}-{random.randint(100, 999)}-{random.randint(1000, 9999)}",
        "address": {
            "street": f"{random.randint(1, 9999)} {random.choice(['Main', 'Oak', 'Pine', 'Maple'])} St",
            "city": random.choice(["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"]),
            "zip": f"{random.randint(10000, 99999)}",
            "country": "USA",
        },
        "avatar": f"https://i.pravatar.cc/150?u={uuid.uuid4()}",
        "uuid": str(uuid.uuid4()),
    }

@app.get("/v1/seed/product", tags=["Seed"])
def seed_product():
    """Generate a fake product for testing seed data."""
    adjectives = ["Premium", "Ultra", "Smart", "Eco", "Pro", "Lite", "Max", "Mini"]
    nouns = ["Laptop", "Phone", "Watch", "Headphones", "Camera", "Tablet", "Speaker", "Monitor"]
    return {
        "name": f"{random.choice(adjectives)} {random.choice(nouns)} {random.randint(1, 9)}",
        "price": round(random.uniform(29.99, 1999.99), 2),
        "sku": f"SKU-{''.join(random.choices(string.ascii_uppercase + string.digits, k=8))}",
        "category": random.choice(["Electronics", "Books", "Clothing", "Food", "Toys"]),
        "stock": random.randint(0, 500),
        "rating": round(random.uniform(1.0, 5.0), 1),
        "description": f"A high-quality {random.choice(nouns).lower()} for everyday use.",
        "tags": random.sample(["new", "sale", "bestseller", "limited", "featured"], k=random.randint(1, 3)),
    }

# =============================================================
# HEALTH & META
# =============================================================

@app.get("/health", tags=["System"])
def health_check():
    """Simple health check."""
    return {"status": "ok", "timestamp": datetime.now().isoformat(), "version": "1.0.0"}

@app.get("/v1/status", tags=["System"])
def system_status():
    """Detailed system status."""
    return {
        "status": "healthy",
        "uptime_seconds": int(time.time() - START_TIME),
        "users_count": len(users_db),
        "products_count": len(products_db),
        "orders_count": len(orders_db),
        "memory_usage_mb": round(random.uniform(50, 150), 2),
        "timestamp": datetime.now().isoformat(),
    }

@app.get("/swagger.json", include_in_schema=False)
def swagger_spec():
    """OpenAPI spec for auto-discovery."""
    return app.openapi()

@app.get("/openapi.json", include_in_schema=False)
def openapi_spec():
    """Alias for /openapi.json (scanner tries both)."""
    return app.openapi()

# Expose /api-docs as well (some scanners probe this)
@app.get("/api-docs", include_in_schema=False)
def api_docs():
    return app.openapi()

@app.get("/v3/api-docs", include_in_schema=False)
def v3_api_docs():
    return app.openapi()

# =============================================================
# MAIN
# =============================================================

START_TIME = time.time()

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  APIForge Test Backend")
    print("  http://localhost:3000")
    print("  Docs: http://localhost:3000/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=3000, log_level="info")
