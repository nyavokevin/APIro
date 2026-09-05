"""
APIForge GraphQL Test Backend
Full GraphQL API for testing APIForge Route Scanner + Request Builder (graphql bodyType).

Run: python backend/app.py  (port 4000)
"""
import os
import time
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
import strawberry
from strawberry.fastapi import GraphQLRouter

from .schema import schema
from .db import users_db, products_db, orders_db, START_TIME

PORT = int(os.getenv("PORT", "4000"))
GRAPHQL_PATH = "/graphql"

# Custom context getter to expose request for auth checks
async def get_context(request: Request):
    return {"request": request}

graphql_router = GraphQLRouter(schema, path=GRAPHQL_PATH, context_getter=get_context)

app = FastAPI(
    title="APIForge GraphQL Test Backend",
    description="Full GraphQL API for testing APIForge Route Scanner (graphql introspection) and Request Builder.",
    version="1.0.0",
    # Hide OpenAPI spec from the standard probes so scanner falls back to graphql.
    # Docs still available but spec is at a hidden path the scanner doesn't check.
    openapi_url="/_hidden_openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount GraphQL router (handles GET/POST /graphql)
app.include_router(graphql_router, prefix="")

# Also expose alias at / so some clients defaulting to POST / work (optional, not scanned)
# We keep it minimal: forward POST / to same handler via middleware fallback is handled by health.

@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat(), "version": "1.0.0", "service": "graphql"}

@app.get("/v1/status", tags=["System"])
def system_status():
    return {
        "status": "healthy",
        "uptime_seconds": int(time.time() - START_TIME.timestamp()),
        "users_count": len(users_db),
        "products_count": len(products_db),
        "orders_count": len(orders_db),
        "timestamp": datetime.now().isoformat(),
        "graphql_endpoint": GRAPHQL_PATH,
    }

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def root():
    return f"""
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>APIForge GraphQL API</title>
    <style>body{{font-family:Inter,system-ui;padding:32px;max-width:780px;margin:0 auto;color:#0f172a}} code{{background:#f1f5f9;padding:2px 6px;border-radius:4px}} a{{color:#4f46e5}} .card{{border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:16px 0}}</style>
    </head><body>
    <h1>🚀 APIForge GraphQL Test Backend</h1>
    <p>Running on <code>http://localhost:{PORT}</code> — GraphQL endpoint <code>{GRAPHQL_PATH}</code></p>
    <div class="card">
      <h3>Try it</h3>
      <ul>
        <li><a href="/graphql">GraphiQL — /graphql</a> (GET playground)</li>
        <li><a href="/docs">FastAPI Docs — /docs</a></li>
        <li><a href="/health">Health — /health</a></li>
      </ul>
      <p>Introspection query used by APIForge scanner:</p>
      <pre><code>POST {GRAPHQL_PATH}
{{"query":"query IntrospectionQuery {{ __schema {{ queryType {{ name fields {{ name }} }} mutationType {{ name fields {{ name }} }} }} }}"}}</code></pre>
    </div>
    <div class="card">
      <h3>Example queries</h3>
      <pre><code>query {{ users(page:1 limit:5) {{ data {{ id name email }} pagination {{ total }} }} }}
query {{ product(id:"SKU-XXXX") {{ id name price }} }}
mutation {{ login(email:"admin@example.com" password:"x") {{ token }} }}
mutation {{ createUser(input:{{name:"Ada", email:"ada@example.com"}}) {{ id name }} }}</code></pre>
    </div>
    </body></html>
    """

# Health alias for generic probing
@app.get("/status", include_in_schema=False)
def status_alias():
    return health_check()

# Make sure OPTIONS preflight is handled via CORSMiddleware — no extra code needed.

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  APIForge GraphQL Test Backend")
    print(f"  http://localhost:{PORT}")
    print(f"  GraphQL: http://localhost:{PORT}{GRAPHQL_PATH}  (GraphiQL)")
    print(f"  Health:  http://localhost:{PORT}/health")
    print(f"  Docs:    http://localhost:{PORT}/docs")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
