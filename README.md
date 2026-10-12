<div align="center">

# APIro

### The API client that **audits your APIs while you build them.**

A local-first API workspace — like Postman, but with an OWASP security scanner, live API discovery, and shareable audit reports baked in. **Zero cloud. Zero account. Zero telemetry.** Runs fully offline.

`Tauri 2` · `Rust` · `React 19` · `TypeScript (strict)` · `150 tests green`

</div>

---

## The problem

API security testing is treated as a separate, expensive step that happens *after* code ships — a pentest engagement, a SaaS DAST bill, a tool your developers never open. So the bugs that actually leak data (broken auth, IDOR/BOLA, injection, forged JWTs, missing rate limits) get found late, by someone else, or not at all.

Meanwhile developers already live in an API client all day.

**APIro puts the audit where the work already happens.** Send a request, click *Full audit*, and get back the vulnerabilities **and** the fixes — mapped to the OWASP API Top 10 — without leaving the app or sending a byte to the cloud.

---

## What makes it different

Most API clients help you *call* an API. APIro also helps you *attack* it (safely, with guardrails) and *prove* it's secure.

### 🛡️ Built-in security auditing
Run a full OWASP API Top 10 pass against any request — or every open request at once with **Full audit**:

| Test | Finds | OWASP |
|---|---|---|
| **Passive scan** | Missing security headers, CORS misconfig, insecure cookies, plaintext HTTP, secrets/stack-traces in responses, JWT in URL | API8 / API2 |
| **Auth enforcement** | Endpoints reachable with **no credentials** or an **invalid token** | API2 |
| **Injection** | SQL injection + reflected XSS by fuzzing query params | API3 |
| **JWT attacks** | `alg:none` acceptance and **weak signing secrets** (live HMAC brute-force) | API2 |
| **Mass assignment** | Privileged fields (`role`, `isAdmin`…) accepted into request bodies | API6 |
| **Rate limiting** | Absence of throttling under a request burst | API4 |
| **BOLA / IDOR** | The same object returned to two different identities | API1 |

Every finding ships with **evidence**, **why it matters**, and a **recommended fix**. Active tests send real traffic, so they're gated behind an explicit confirmation on any non-local environment.

### 🔎 Live API discovery
Point APIro at a **website URL**. It fetches the page and its scripts, extracts every API the site calls (`fetch` / `axios` / `XHR` + API-shaped URLs and GraphQL endpoints), and lists them — ready to **import as a collection**, open in the workspace, or **send straight to a security audit**. Discover → import → audit, in three clicks.

### 📄 Shareable audit reports
Export a professional, OWASP-mapped **audit report** (print-ready HTML/PDF or Markdown) with a risk score, severity summary, and per-finding remediation. The deliverable you hand a client or attach to a PR.

---

## Everything else it does

A complete API workspace, all offline and git-friendly:

- **Request builder** — params, headers, body (JSON/XML/form/urlencoded/GraphQL/binary), auth (Bearer/Basic/API-key/OAuth2/JWT), pre-request & test scripts, response timeline, schema-lock & baseline diff.
- **Collections** — stored as human-readable, **git-diffable `*.request.yaml`** files. Import from cURL, Postman, OpenAPI/Swagger, Insomnia, HAR; export to Postman, OpenAPI, HAR, YAML, cURL.
- **Environments** — `{{variables}}`, dynamic Faker values, OS-keyring secret storage, instant switching with prod safeguards.
- **Route scanner** — discover endpoints from a live OpenAPI/GraphQL URL **or by parsing source code** (Express, FastAPI, Laravel, Spring, ASP.NET, Gin + generic), with watch mode, scan diff, and OpenAPI export.
- **Mock servers** — spec-driven mocks (one `*.mock.yaml` per route), `mock` / `proxy` / `record` modes, stateful SQLite store, chaos latency/errors, and agent-native MCP tools.
- **Collection runner** — sequential or parallel runs with Postman-style assertions, request chaining, and **JUnit / HTML** reports.
- **Docs export** — PDF / Markdown / HTML / OpenAPI, with multi-language code snippets.
- **History**, **command palette** (`⌘K`), resizable panes, dark OLED UI.
- **CLI for CI/CD** — run collections headless, non-zero exit on failure.

---

## Who it's for

- **Developers & teams** who want to catch API security bugs in the same tool they build in — before review, not after.
- **Freelancers & agencies** who need to produce a credible, branded API audit report for a client.
- **Security engineers** who want a fast, local, no-account way to triage an API's OWASP exposure.

---

## Installation

### Prerequisites

- **Node.js 18+**
- **Rust** (stable) via [rustup](https://rustup.rs/) — APIro compiles a native Rust backend
- OS build dependencies for Tauri — see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) (WebView2 on Windows, `build-essential`/`webkit2gtk` on Linux, Xcode CLT on macOS)

### Run from source (development)

```bash
git clone <your-repo-url> apiro
cd apiro
npm install
npm run dev          # launches the Rust backend + Vite/React renderer
```

> The first `npm run dev` compiles the Rust backend, which can take a few minutes. Subsequent runs are fast.

### Build a desktop installer

```bash
npm run build
```

Platform installers are written to `src-tauri/target/release/bundle/`:
`.msi` / `.exe` (Windows), `.dmg` (macOS), `.deb` / `.AppImage` (Linux).

---

## Testing

```bash
npm test             # 150 unit + integration tests (Vitest)
npm run typecheck    # TypeScript strict — renderer + shared
npm run lint         # ESLint
```

The test suite covers the request engine, importers, the security scanners (auth, injection, JWT, mass-assignment, rate-limit, BOLA), API discovery, and report generation. If the parallel runner ever runs out of memory on a low-RAM machine, run it single-process:

```bash
npx vitest run --pool=forks --poolOptions.forks.singleFork=true
```

### CLI runner (CI/CD)

```bash
npm run cli -- run collection.yaml --env staging.json --junit report.xml
```

Non-zero exit on any failed test, so it drops straight into a pipeline.

---

## Stack & principles

Built with **Tauri 2** (Rust backend — `reqwest`, `rhai`, `rusqlite`, `axum`) and a **React 19 + TypeScript (strict) + Tailwind + Zustand** renderer. A shared TypeScript logic layer (importers, variable resolution, seed generation, security scanners) is browser-safe and reused by a `localStorage`+`fetch` web bridge when run outside Tauri.

- **Local-first** — collections are files on your disk, diffable in git.
- **Offline** — the whole core works with no network.
- **Zero cloud / zero account / zero telemetry** — your API keys and traffic never leave your machine. The only optional network feature is a bring-your-own-key AI assistant.

---

## Roadmap

Honest about the edges — here's what's next:

- **Security in CI** — a headless `audit` command emitting **SARIF** (GitHub code-scanning) + a fail-on-severity gate.
- Broader injection coverage (SSRF, NoSQL, command injection) and function-level authz (BFLA) testing.
- Runtime-aware API discovery (headless browser) to catch dynamically built endpoints.
- Transport adapters for WebSocket / SSE / gRPC and cryptographic signing for OAuth1 / Hawk / AWS SigV4.

---

<div align="center">

**Catch the bug before it ships. Locally.**

</div>
