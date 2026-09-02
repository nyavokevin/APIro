# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: API developers using APIForge as their daily driver for building requests, scanning/importing APIs, seeding test data, running tests, and exporting documentation — as a local-first, offline-capable Postman alternative.
- Secondary: QA/automation engineers running collections headlessly in CI/CD via the `apiforge run` CLI with JUnit output.

Both audiences value privacy and offline reliability: no accounts, no telemetry, no cloud dependency.

## Product Purpose

APIForge is a desktop API client and backend explorer. It lets a developer build, send, and inspect HTTP requests; auto-discover routes via OpenAPI/Swagger/GraphQL introspection; generate context-aware seed data; manage environments and variables; write test assertions and chain requests; mock endpoints; and export PDF/Markdown/HTML/OpenAPI documentation — all locally, all offline. Success: a developer completes the full request→test→document workflow without ever being asked to sign in, sync, or connect to a cloud service.

## Positioning

Zero forced cloud, zero login, 100% offline core. Every core feature works without network access to any APIForge-owned service, and collections live as human-readable, diff-friendly JSON files the user owns. A cloud-first client cannot truthfully copy this position.

## Operating Context

- Desktop app: Tauri 2 shell + React 19 renderer (TypeScript, Tailwind, Zustand, Monaco). Runs as a native window (1440×900 default, 1280×800 minimum).
- The renderer also runs standalone in a plain browser via a self-contained web bridge (localStorage persistence, browser fetch); features that fundamentally require Node/Electron/Tauri degrade gracefully there.
- Collections are git-friendly JSON files; users may keep them in repos and diff them.
- CI context: `apiforge run collection.json --env staging.json --junit report.xml` with non-zero exit on test failure.
- Window: min 1280×800 — desktop-first layout; dense, multi-pane operate UI (command palette Ctrl/Cmd+K, resizable panes, tabs).

## Capabilities and Constraints

Confirmed capabilities (implemented, tested — see README status table):

- HTTP/1.1 request engine (GET/POST/PUT/PATCH/DELETE, JSON/XML/text/form-data/urlencoded/graphql/binary bodies, redirects, timing timeline, cookies).
- Route scanner / auto-discovery (OpenAPI/Swagger fetch, GraphQL introspection, REST pattern inference, one-click collection generation).
- Faker-based seed generator (context-aware by key name, bulk, history, templates).
- Environments & variables (unlimited, typed incl. secrets, `{{var}}` + dynamic `{{$randomEmail}}`/`{{$timestamp}}` resolution).
- Collections/workspaces with import (cURL, Postman v2.1, OpenAPI 3, Swagger 2, Insomnia, HAR) and export (JSON, OpenAPI YAML, Markdown, HTML).
- Testing & automation (pre-request scripts, Postman-style assertions, chaining, sequential/parallel runner, CLI with JUnit).
- PDF documentation export (cover, TOC, endpoint tables, multi-language snippets; Puppeteer PDF with printable-HTML fallback).
- Auth: None, API-Key, Bearer, Basic, Digest, OAuth2 config, JWT decode + expiry countdown.
- Mock server (static/dynamic responses, configurable port, hit history).
- Offline heuristic AI assistant (4xx/5xx fix suggestions, starter tests, response explanations — no cloud LLM by design).

Known partial/undecided (explicitly open, not commitments):

- Transport adapters beyond HTTP in the UI (WebSocket/SSE/MQTT/gRPC clients are wired in deps but the UI is HTTP-only today).
- Crypto signing for OAuth 1.0a, Hawk, AWS SigV4, NTLM, Kerberos (modelled in types/UI, not computed).
- Real-time collaboration (WebRTC/WebSocket sync, comments, RBAC) — not implemented; file/Git export+import only.

Hard constraints (binding, user-confirmed):

- Offline-first: no telemetry, no accounts, no cloud uploads — ever, in the core.
- Git-friendly, human-readable JSON storage; no proprietary lock-in.
- Work must not regress the vitest suite (69 tests) or strict typecheck (`npm run typecheck`, `npm test`, `npm run lint` are the verification commands).

Stack note: the README's Electron references are stale; Tauri 2 is the committed shell (user-confirmed).

## Evidence on Hand

- README.md with a verified per-feature status table (12 feature areas, ✅/△ markers).
- Full React renderer source under `src/renderer/src/` (pages: Workspace, Collections, Environments, RouteScanner, MockServers, Testing, Settings).
- 69 passing unit/integration tests (`tests/`), strict tsc clean.
- No marketing site, testimonials, customers, benchmarks, or brand assets exist yet; future work must not fabricate any.

## Product Principles

1. Local-first is non-negotiable: every feature must work with the network unplugged from APIForge's own services.
2. The user owns their data: human-readable, diff-friendly files over opaque stores.
3. Operate over impress: this is a dense professional tool; scanability, consistency, and keyboard flow outrank decoration.
4. Automatable by default: everything the UI can do, the CLI can do in CI.
5. Degrade gracefully: browser mode keeps the core workflow usable, not broken.

## Accessibility & Inclusion

Dark/light/system theme support exists. No formal standard (e.g. WCAG level) has been set yet — open decision.
