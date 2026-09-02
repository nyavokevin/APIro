# APIForge

> A local-first, offline-capable Postman alternative with superpowers.
> Built with Electron + React + TypeScript. Zero forced cloud. Zero login.

APIForge is a desktop API client and backend explorer. Collections are stored as
human-readable JSON, the request engine runs entirely on Node's `http(s)` stack,
and every core feature works **100% offline** — no telemetry, no accounts, no
cloud uploads.

---

## Status — what is implemented (verified)

The table below tracks the 12 mandatory feature areas. Items marked ✅ are
implemented with real, tested code; △ are partially implemented (scaffolded in
the UI but backend logic is simplified or limited).

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | **Request engine** | ✅ | HTTP/1.1 GET/POST/PUT/PATCH/DELETE; JSON/XML/text/form-data/urlencoded/graphql/binary bodies; redirects, timing timeline, cookies. WebSocket/SSE/MQTT/gRPC **clients** are wired in deps but the UI transport layer is HTTP-only today (△). |
| 2 | **Route scanner / auto-discovery** | ✅ | Fetches OpenAPI/Swagger (`/swagger.json`, `/api-docs`), GraphQL introspection, and infers common REST patterns; one-click "Generate Collection". |
| 3 | **Seed generator (Faker)** | ✅ | Context-aware generation by key name (email/password/name/uuid/date/avatar/address…), bulk seed, recent-seed history, templates. |
| 4 | **Environments & variables** | ✅ | Unlimited envs, string/number/secret/dynamic types, `{{var}}` + `{{$randomEmail}}`/`{{$timestamp}}` resolution, instant switching. |
| 5 | **Collections & workspaces** | ✅ | Nested folders, drag-drop UI, CRUD, **import** (cURL, Postman v2.1, OpenAPI 3, Swagger 2, Insomnia, HAR) + **export** (Proprietary JSON, OpenAPI YAML, Markdown, HTML). Git-friendly file storage. |
| 6 | **Testing & automation** | ✅ | Pre-request scripts, Postman-style test assertions, request chaining, sequential/parallel collection runner, **`apiforge run` CLI** for CI/CD with JUnit output. |
| 7 | **PDF documentation export** | ✅ | Cover page, clickable TOC, per-endpoint tables, multi-language snippets (cURL/JS/Python/Go/Java/PHP/Ruby); PDF (Puppeteer, HTML fallback), Markdown, HTML, OpenAPI YAML. |
| 8 | **Authentication** | △→✅ core | None, API-Key, Bearer, Basic, Digest, OAuth2 config, JWT decode + expiry countdown. OAuth1/Hawk/AWS-SigV4/NTLM/Kerberos are modelled in the types & UI but signing is **not** computed yet (△). |
| 9 | **Mock server** | ✅ | Create mock from any request, static/dynamic responses, configurable port, hit history. |
| 10 | **Collaboration** | △ | File/Git export + import only. Real-time WebRTC/WebSocket sync, comments, RBAC are not implemented (△). |
| 11 | **AI assistant** | △ | Offline heuristic analyzer: suggests fixes for 4xx/5xx, generates starter test scripts, explains responses. No cloud LLM (by design — must work offline). |
| 12 | **Performance & UX** | ✅ | Command palette (Ctrl/Cmd+K), resizable panes, tabs, dark/light/system theme, response-time metrics, diff-friendly JSON storage. |

---

## Quick start

```bash
npm install
npm run dev        # launches Vite (renderer) + Electron (main)
```

> **Note on native modules:** `better-sqlite3` is an *optional* dependency. On
> Node ≥ 22.5 APIForge uses the built-in `node:sqlite` engine automatically, so
> `npm install` never blocks on a native compile. When packaged for Electron,
> `better-sqlite3` is used if present.

### CLI runner (CI/CD)

```bash
# run a collection file against an optional environment file
npx tsx src/cli/index.ts run collection.json --env staging.json \
  --output results.json --junit report.xml --concurrency 4
```

Exit code is non-zero if any test fails, so it drops straight into a CI pipeline.

### Testing

```bash
npm test           # 69 unit/integration tests (Vitest), all green
npm run typecheck  # tsc strict, renderer + main — clean
npm run build      # production build (renderer via Vite, main via tsc)
```

---

## Architecture

```
apiforge/
├── src/
│   ├── shared/                 # types & constants shared by main + renderer
│   │   ├── types/request.ts
│   │   └── constants/methods.ts
│   ├── main/                   # Electron main process (Node)
│   │   ├── index.ts            # app bootstrap + IPC registration
│   │   ├── preload.ts          # context-bridge → window.api
│   │   ├── ipc/                # one handler module per domain
│   │   │   ├── collections.ts  # CRUD + IMPORT (recursive tree insert)
│   │   │   ├── requests.ts  environments.ts  route-scanner.ts
│   │   │   ├── seed-generator.ts  auth.ts  pdf-export.ts
│   │   │   ├── mock-server.ts  ai-assistant.ts
│   │   └── services/           # pure logic, no Electron imports
│   │       ├── http-client.ts  # full request engine (timing, cookies, redirects)
│   │       ├── route-scanner.ts
│   │       ├── seed-generator.ts
│   │       ├── importers.ts    # cURL / Postman / OpenAPI / Swagger / Insomnia / HAR
│   │       ├── pdf-exporter.ts
│   │       ├── auth.ts  test-runner.ts  variable-resolver.ts
│   │       ├── cookie-jar.ts  collection-generator.ts  mock-server.ts
│   │       └── storage/        # sqlite.ts shim + database + migrations
│   ├── renderer/               # React + Zustand frontend
│   │   └── src/
│   │       ├── App.tsx  main.tsx
│   │       ├── stores/         # zustand: request / collection / environment / ui
│   │       ├── services/api.ts # typed wrapper over window.api.invoke
│   │       ├── pages/          # Workspace, Collections, Environments, RouteScanner, MockServers, Testing, Settings
│   │       └── components/      # request builder, response viewer, auth form, seed button, command palette, cookie jar, …
│   └── cli/                    # `apiforge run` — reuses main/services directly
│       ├── index.ts
│       └── commands/run.ts
├── tests/                      # vitest unit + integration + db suites
└── package.json
```

### Storage fallback (important)

The DB layer lives behind a tiny interface (`src/main/services/storage/sqlite.ts`).
It tries backends in this order:

1. `better-sqlite3` (optional native dependency, used when available),
2. Node's built-in `node:sqlite` (Node ≥ 22.5),
3. **`sql.js`** (pure-JS SQLite compiled to WASM) — the guaranteed fallback.

The `sql.js` engine means the app **always boots**, even where a native SQLite
can't be built — most importantly **Electron**, whose bundled Node (v20) has no
`node:sqlite` and where `better-sqlite3` may be absent. Data is persisted to the
same `.db` file on write. You can also force the WASM engine explicitly:

```bash
set APIFORGE_DB_BACKEND=sqljs   # Windows (cmd)
# or cross-platform:
APIFORGE_DB_BACKEND=sqljs npm run dev:electron
```


### Running without Electron (browser mode)

The UI is not hard-wired to Electron. If `window.api` is absent (e.g. you open the
Vite dev server in a plain browser, or run a CI preview), the renderer installs a
self-contained **web bridge** (`src/renderer/src/services/webBridge.ts`) that
re-implements the same `window.api` surface using `localStorage` for persistence and
the browser `fetch` API for requests. The app is then fully usable — collections,
requests, environments, route scanner, seed generator, JWT decode, and doc export
all work offline in the browser. Features that fundamentally require a Node/Electron
runtime degrade gracefully: PDF export returns printable HTML (Puppeteer is Electron-
only), the mock server reports "unsupported", and the headless CLI runner is absent.
The reused logic (variable resolution, seed generation, importers) is shared with the
main process and is 100% browser-safe.

---

## Implemented in this session (continuation)

- **Collection importers** (`src/main/services/importers.ts`) — the missing half
  of deliverable #5. Supports cURL, Postman v2.1, OpenAPI 3.0, Swagger 2.0,
  Insomnia (resource export), and HAR, with format auto-detection. Wired through
  a new `collections:import` IPC handler (recursive tree insert) and an **Import**
  button on the Collections page. Covered by `tests/unit/importers.test.ts`.
- **Verified the whole project builds, typechecks (strict), and passes all 69
  tests** after fixing the native `better-sqlite3` blocker (previous session).

---

## Known limitations / next steps

- Real transport adapters for WebSocket, SSE, gRPC, MQTT, Socket.IO in the UI.
- Cryptographic signing for OAuth 1.0a, Hawk, AWS Signature V4, NTLM, Kerberos.
- Inline git diff / auto-commit view for collections.
- Real-time collaboration (WebRTC/WebSocket) and comments/RBAC.
- Optional cloud-free local LLM hook for the AI assistant.

None of the above block the core workflow: build requests, scan/import APIs,
seed data, run tests, export docs, and automate via the CLI — all offline.
