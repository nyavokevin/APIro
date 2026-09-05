# APIForge — GraphQL Test Backend

Dedicated **full GraphQL API** for testing APIForge's **Route Scanner** (`graphql` introspection) and **Request Builder** (`graphql` bodyType), on its own port so it doesn't compete with the REST scanner.

```
tools/graphql-api/
├── backend/
│   ├── app.py            # FastAPI + strawberry GraphQLRouter (port 4000)
│   ├── schema.py         # Query / Mutation types + resolvers
│   ├── db.py             # in-memory seed (users/products/orders)
│   └── requirements.txt
├── tests/
│   ├── test_graphql_scanner.py   # introspection discovery (mirrors Route Scanner)
│   ├── test_graphql_api.py       # CRUD / auth / errors
│   └── conftest.py               # fixtures: TestClient + live server
├── run.ps1               # one-shot runner (install + pytest + live)
└── README.md
```

Port **4000** by default (`$env:PORT=4000`). REST backend lives on `3000` — keep them separate so scanner `detectedSpec` is unambiguous (`graphql` vs `openapi`).

## Quick start

```powershell
# 1. Install deps
pip install -r backend/requirements.txt

# 2. Run server alone
$env:PORT=4000; python -m backend.app
# → http://localhost:4000/graphql  (GraphiQL playground)
# → http://localhost:4000/health
# → http://localhost:4000/docs

# 3. Full runner (install + in-process pytest)
powershell -ExecutionPolicy Bypass -File run.ps1
# with live HTTP tests:
powershell -ExecutionPolicy Bypass -File run.ps1 -Live

# or plain pytest
pytest tests -v
pytest tests -v --live
```

## What to try in APIForge

1. Start server: `$env:PORT=4000; python -m backend.app`
2. APIForge → **Route Scanner** → enter `http://localhost:4000` → **Scan** → should show `graphql · ~16 endpoints` (each field = `POST /graphql` entry, tag `graphql`).
3. **Import** → Collections → `Scanned Collection` with folders per field (or single list — scanner groups by tag `graphql`).
4. **Request Builder**: New request `POST http://localhost:4000/graphql`, Body type `graphql`, query:
   ```graphql
   query { users(page:1 limit:5) { data { id name email } pagination { total } } }
   ```
   Vars: `{"page":1}` — check `200` + CORS.

Introspection probed by scanner (`src/main/services/route-scanner.ts:13`):

```json
POST /graphql
{"query":"query IntrospectionQuery { __schema { queryType { name fields { name } } mutationType { name fields { name } } } }"}
```

## Schema

**Queries:** `health`, `status`, `me` (requires `Authorization: Bearer <token>`), `users(page limit role search)`, `user(id)`, `products(page limit category minPrice maxPrice inStock)`, `product(id)`, `orders(page limit status)`, `order(id)`, `seedUser`, `seedProduct`, `slow(delay)`, `echo(message)`, `errorTest(code)`

**Mutations:** `login(email password)`, `refreshToken(refreshToken)`, `createUser(input)`, `updateUser(id input)`, `deleteUser(id)`, `createProduct(input)`, `deleteProduct(id)`, `ping`

Mirrors `tools/api-test` REST domains so results are comparable.

## REST vs GraphQL ports

| Backend | Port | Scanner probe | Expected `detectedSpec` |
|---------|------|---------------|-------------------------|
| `tools/api-test` (REST) | 3000 | `GET /swagger.json` etc | `openapi` |
| `tools/graphql-api` (GraphQL) | 4000 | `POST /graphql` introspection | `graphql` |

Scanner tries OpenAPI first (`src/main/services/route-scanner.ts:142`); only if none found does it try GraphQL. A pure GraphQL host with no `openapi.json` will correctly be classified `graphql`.

## Troubleshooting

- **Port 4000 occupied**: `netstat -ano | findstr :4000` → `taskkill /PID <pid> /F`, or `$env:PORT=4001; python -m backend.app`
- **CORS**: enabled `allow_origins=["*"]` (same as REST backend).
- **`strawberry` not found**: `pip install strawberry-graphql[fastapi]` (in requirements.txt).
- **GraphiQL not loading**: open `http://localhost:4000/graphql` in browser — `GET` serves IDE, `POST` serves execution.
