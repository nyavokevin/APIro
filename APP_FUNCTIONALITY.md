# APIForge / APIro — Fonctionnalités Complètes

> **Version:** 0.1.1 (Tauri 2 + React 19 + TypeScript strict + Tailwind)  
> **Principe:** Local-first, offline-capable, zéro compte, zéro cloud, zéro télémétrie.  
> **Sources:** `src/renderer/src/pages/*.tsx` · `src/renderer/src/stores/*.ts` · `src/renderer/src/services/*.ts` · `src/main/services/*.ts` · `src-tauri/src/lib.rs`

---

## 0. Vue d'ensemble & Positionnement

| Axe | Détail |
|---|---|
| **Utilisateurs** | Développeurs API (daily driver) + QA/CI via CLI |
| **Fenêtre** | `1440×900` par défaut, min `1280×800`, frameless `Titlebar.tsx` 36px |
| **Thème** | Dark-only OLED `#070709`/`#0E0E10` violet `#8B5CF6`, Geist Sans, spring `200ms` |
| **Stockage** | Collections = `folders/*.request.yaml` git-diffable + Environments = `settings JSON + OS keyring` + History = SQLite/LS |
| **Offline** | Tout le cœur fonctionne débranché. `webBridge.ts` fournit fallback `localStorage + fetch` en navigateur pur |
| **CI** | `apiforge run collection.json --env staging.json --junit report.xml` exit non-zéro si échec |

**12 domaines validés (README):** Request engine ✅, Scanner ✅, Seed ✅, Envs ✅, Collections ✅, Testing ✅, PDF export ✅, Auth ✅ core, Mock ✅, Collab △, AI △ heuristique, Perf/UX ✅.

---

## 1. Shell Global

### 1.1 Bootstrap `App.tsx`
Force `dark`, applique `--font-mono` (`system|jetbrains|fira|sfmono|menlo`) + `--code-font-size` (`12|13|14|16px`) depuis `uiStore`, charge `workspaceStore.loadWorkspace()`, ouvre `New Request` si `tabs.length===0`.

### 1.2 Titlebar `layout/Titlebar.tsx` — 36px
Visible seulement sous Tauri (`isTauri()`). Drag-region `data-tauri-drag-region`, double-clic = toggle maximize. Gauche : icône `Boxes` violet 22px + `APIro` 12.5px semibold + `· Local · Offline` + fill. Droite : 3 contrôles 46px `Minimize (Minus)` | `Maximize/Restore (Square/Copy)` via `getCurrentWindow().isMaximized()+onResized` | `Close (X)` danger `hover #EF4444`.

### 1.3 Sidebar `layout/Sidebar.tsx` — 228px `#0E0E10`
Logo `Boxes 34px violet + APIro 15.5/700 + Reimagined 11/500 #7A7F93 + v0.1`. Nav 9 items 38px `hover #16161A translate-x1` active `rgba violet 0.10 border-left #8B5CF6 inset shadow`:
`Dashboard | Workspace | Collections | History | Environments | Scanner | Mocks | Testing | Security` ( **Flow retiré en 0.1.1** → migration `flow→dashboard` dans `uiStore`). Badge Security violet/rouge `N` + bottom `Settings`. Support `activePage` persistance.

### 1.4 Header `layout/Header.tsx` — 64px
Titre `22px 650 -0.03em` + pill count (`collections.length` pour dashboard/collections, pulse violet) + gradient separator `1px #1E1E24` + spacer 10px. Droite : bouton `⌘K` + `EnvironmentDropdown` 210px (couleur prod rouge `rgba(239,68,68,0.08)` / staging amber / `#121212`, dot 7px, `AlertTriangle` si prod, `ChevronDown` rotate 180). Menu `268px max-h 340px #121215` flip `dropUp` si `spaceBelow<280`, bannière prod rouge, footer `N env(s)`.

### 1.5 MainLayout `layout/MainLayout.tsx`
`h 100dvh flex-col overflow-hidden bg #070709` + `Titlebar + flex(Sidebar + col(Header + main))`. Radial glow `violet 18% + green 8% opacity 0.035`. `zenMode` → bare `Titlebar + main` (toggle `Ctrl+\`).

### 1.6 Command Palette `components/CommandPalette.tsx` — `Ctrl/Cmd+K`
Overlay `15vh paddingTop rgba(0,0,0,0.8)` + dialog `640×60vh #121212 border #262626`. Input `Type a command…` + `Command.List max-h 72`. Groupes:
- **Actions:** `New Request Tab Plus (Ctrl+N→newTab)` · `Export Docs FileDown`
- **Navigation (10):** `Dashboard | Workspace | Collections | History | Environments | Scanner | Mocks | Testing | Security | Settings` → `setActivePage`
`PaletteItem` `hover #16161A active violet`, footer `↑↓ Enter Esc`. Mode `Export Documentation` : sélecteur collection + `Back/Close` → `ExportDialog` (PDF/Markdown/HTML/OpenAPI).

### 1.7 Raccourcis globaux `App.tsx`
`Ctrl/Cmd+K` palette · `Ctrl/Cmd+N` new tab · `Ctrl/Cmd+W` close tab · `Ctrl+\` zen · `Ctrl+Tab` cycle tabs · `Enter` dans URL = Send.

---

## 2. Dashboard `pages/Dashboard.tsx`

At-a-glance santé workspace, live-réactif, pas de refresh. Cartes :
- **Header** `LayoutDashboard + Local pulse`
- **Top 3:** `SecuritySummaryCard` (findings open, critical/high pulse, OWASP map) · `TestingSummaryCard` (last run pass/fail, coverage) · `ScannerSummaryCard` (routes, frameworks, diff)
- **Row:** `EnvironmentStatusBar` (dot env + `environments/*.env.yaml`, résolution `Collection-local › Workspace › Global`) + `MocksStatusBar` (running/port)
- **RecentActivityFeed** (history, scans, tests) + **QuickActionsBar** (`New Request | Import | Scan | New Mock`)
Données : `workspaceStore.collections` + `securityStore` + `testingStore` + `environmentStore.activeId`. Backend : `api.collections.list`, `api.environments.list`.

---

## 3. Workspace — Request Builder `pages/Workspace.tsx`

### 3.1 États
- **Vide:** Shield + `+ New Request Tab` + tip `Ctrl+N or ⌘K`
- **Barre requête** `RequestBuilder.tsx`: `<select>` méthode (couleurs `METHOD_COLORS` violet/rouge/orange) + `<input mono>` `https://api.example.com/endpoint · try {{baseUrl}}/users` (sync params `syncParamsFromUrl` ↔ URL) + divider + `SecurityButton` badge count + `Send` violet glow `Send/Sending…` spinner, `disabled` si `url` vide. `Enter` = Send.
- **Onglets requête** `RequestTabBar`: tabs draggables + `+` new + `×` close, indicateur actif.
- **Split vertical** `react-resizable-panels` : top `48 min22 max75` (contenu tabs) + handle `GripHorizontal` + bottom `52 min25` (`ResponseViewer`). Zen = URL + Response plein + `Exit Zen (Ctrl+\)`.

### 3.2 8 Tabs internes

| Tab | Composant | Fonctionnalités |
|---|---|---|
| **Params** | `ParamsTab → KeyValueEditor` | Grille `28px 1fr 1fr 36px`, checkbox enabled, Key/Value avec autocomplete `{{var}}`, `enabled` filtré en query string, sync bidirectionnel URL⇄Table |
| **Headers** | `HeadersTab` | Même éditeur + auto `Content-Type` selon `bodyType`, injection `Auth` |
| **Body** | `BodyTab` | Sélecteur `none\|json\|xml\|text\|form-data\|urlencoded\|binary\|graphql`, `CodeEditor` mono, pretty/minify, bouton seed `{{$random…}}`, toggle `autoSeed` + `seedStrategy emptyOnly\|all` |
| **Auth** | `AuthTab → AuthForm` | `none\|bearer\|basic\|api-key\|oauth2\|jwt` ; champs token/user/pass/key/in, Bearer `Authorization: Bearer …`, Basic base64, api-key header/query, OAuth2 tokenUrl/clientId/secret/scope/grant, JWT decode + expiry countdown |
| **Pre-request** | `PreRequestTab` | `CodeEditor` Rhai `preRequestScript`, exécuté avant send via `runPreRequestBrowser(req, vars)` muté + vars chaînées |
| **Tests** | `TestsTab` | `CodeEditor` `testScript` `pm.test()/pm.expect()/chai`, helpers `SeedButton` |
| **Results** | `TestResults` | `requestStore.testResults` pass/fail + badge flaky |
| **Security** | `SecurityTab` | Shield + badge count (rouge si critical/high) + `SecurityTab` panel complet (voir §8) |

**Événement:** `apiforge:open-workspace-security` → focus tab `requestId` + page `workspace` + tab `security`.

### 3.3 Données
`RequestData {id,name,method,url,headers:KeyValuePair[],params,bodyType,body,auth:AuthConfig,preRequestScript,testScript,autoSeed,seedStrategy,lockedSchema,variables}`  
`ResponseData {id,statusCode,statusText,headers,body,contentType,responseTime,size,timeline:{dns,tcp,tls,ttfb,download,total},cookies,error,testResults?}`

### 3.4 ResponseViewer `components/response/ResponseViewer.tsx`
- **Loading:** skeleton + pulse
- **Vide:** `No response yet` illustrations + `Shortcuts` + `Recent` 3 history + `Quick start Import/New`
- **Avec réponse:** pill status `2xx #10B981 | 3xx #FBBF24 | 4xx #EF4444` + dot glow + `responseTime ms` + `size` + `AIHelpButton` + `Lock schema` (infère `inferSchema` + stock `lockedSchema` + `localStorage apiro.lastResponse.<id>`) + `Save baseline` + onglets `Preview|Body|Raw|Headers|Timeline|Diff` (Diff si baseline). Preview auto si HTML. Erreur banderole rouge + drift amber si `diffSchemas`. Body : `JsonTree` si JSON, sinon `<pre>` ; `HtmlPreview` iframe ; `HeadersView` table ; `Timeline` grid `ttfb/download/total` + bar.

### 3.5 Envoi `requestStore.send(id)`
`loading→true` → `generateBulkSeed` → `runPreRequestBrowser` (vars) → `api.requests.execute(request, variables, runId)` → `runTestsBrowser` si `testScript` → `testResults` → `pushSeedSnapshot` → toasts (`Network error | failed tests | 4xx warning | 2xx success size`) + history. Gère `Invalid URL`.

---

## 4. Collections `pages/Collections.tsx`

Gestion arborescente fichier-drivée.

**Barre gauche 300px** `FolderTree + Collections + count collections·totalRequests` + search `Filter…` (nom ou requête descendante) + `New (primary) + Import (secondary)` + `Export (secondary)` (Flow retiré) + liste `animate-fadeUp 32ms` (row : icône folder/file, nom truncate, badge `count` mono, flèche active). Footer `Layers N requests total`. Détail : si `!selected` carte `No collection selected` `folders/*.request.yaml` + `New/Import` ; si sélection : header `icon/name/count/description` + `Open all in Workspace` (boucle `openRequest`) + `Export` + `Delete` (confirm `Delete “…” and its N request(s)?`) ; corps : si `request` carte `method url + Open in Workspace →` ; si `folder` avec enfants `CollectionTree` (double-clic rename, hiérarchie récursive) ; si vide `This collection is empty`. Tip `Requests open in Workspace. Use Environments…`

**Modals** : `NewCollectionModal` (nom, type folder/request, parent) · `CollectionShareImportModal` (paste/fichier, auto-détect format) · `CollectionShareExportModal` (format).

**Modèle** : `Collection {id,name,description,type:'folder'|'request',parentId?,data?:RequestData,children?,createdAt,updatedAt}`

**Imports** `importers.ts` — auto-détect `detectFormat(trim)` ordre `curl `→ `log.entries` HAR → `resources` Insomnia → `swagger` → `openapi|paths` → `info+item` Postman :
- **cURL** (`parseCurl`) tokenize CLI, body types `raw/urlencoded/formdata/file`
- **Postman v2.1** (headers/params/body mode + auth bearer/basic/apiKey/oauth2 + events prerequest/test)
- **OpenAPI 3.0 / Swagger 2.0** (servers/host+basePath + paths + tags grouping + query/header params + requestBody examples)
- **Insomnia v4** (`request_group`/`request` parentId tree)
- **HAR** (`log.entries`)

**Exports** `collection-exporters.ts` :
`postman v2.1 | openapi 3.1.0 | har 1.2 | yaml scaffold | curl` (première requête). → `{content,filename,mime}`

**Backend** : `api.collections.list/create/read/update/delete/import` + Rust `yaml_read_tree | yaml_save_tree | yaml_replace_all` (cache `collectionsCache`), fallback navigateur `localStorage apiforge.web.collections`.

---

## 5. Environments `pages/Environments.tsx`

**Toolbar** violet `Layers` + `Workspace-scoped • Collection-local overrides` + count pill + search `Search envs or keys…` + `Import` + `New environment name` input `+ Add` (Enter).

**Bande résolution** : `Workspace environments/*.env.yaml › Collection-local › Global • Resolution: Collection-local › Workspace › Global`

**Liste gauche 340px** (desktop) : header `Environments + filtered count`, vide `No environments yet / No matches` + `Import` + tip `{{baseUrl}}`, chaque row dot couleur (`color ?? isActive?violet:#232329` pulse), nom, `✓` si actif, pill `vars.length`, `Shield` jaune si secrets>0, hover actions `Download | Copy duplicate (uid new) | Trash`. `onClick setActive`. Mobile grid alternative.

**Détail droite** : si `selected` header input `type=color` + nom + badge `imported_from` + pill `N vars` + `Export` + `EnvironmentEditor` scroll ; si vide illustration `Palette+Sparkles` + aperçu 4 + `Import/New` + tip `Postman, Insomnia, .env, OpenAPI, CSV`.

**Éditeur** : header `✓ Key Value Type On (delete)`. Ligne : checkbox enabled, Key mono, Value (`boolean` → toggle `true/false` violet/gris sinon `text/password` avec `Eye/EyeOff` si secret), Type `string|number|boolean|secret|dynamic` (`{{$randomUUID}}`), label `on/off` green/amber, trash. `Add variable` ghost dashed + `Save` primary violet glow + toast `Saved ✓` + tip `{{key}} / {{$randomUUID}}`.

**Modèle** : `Environment {id,name,variables:EnvironmentVariable[],isActive,color?,meta:{id,created,modified,source},createdAt}` ; `EnvironmentVariable {id,key,value,type:'string'|'number'|'boolean'|'secret'|'dynamic',enabled}`

**Résolution** `variable-resolver.ts` : remplace d'abord `{{$fn(args)}}` (`randomEmail|timestamp|isoTimestamp|unixTimestamp|uuid|randomInt(min,max)|randomString(len)|seed(field)|faker(path)` via `@faker-js/faker`) puis `{{key}}` via map `enabled` seul. `dynamic` passe-through.

**Import/Export** : `EnvironmentImportModal` (paste/fichier, format `postman|insomnia|dotenv|.env|openapi|csv`, toggle `encryptSecrets`) · `EnvironmentExportModal` (format `postman|dotenv|openapi…`, secretMode `encrypted|plain|masked` → `KEYRING_REF:sha256:…`). Parsers `environment-parsers.ts` (Postman `values`, Insomnia `environment`, `.env` `KEY=val` + `export`, OpenAPI `servers` variables). Exporters `environment-exporters.ts`.

**Backend** : `api.environments.list/create/update/delete/setActive` → Tauri `settings_get/set 'environments' JSON` + `keyring` secrets ; fallback `localStorage`.

---

## 6. Route Scanner `pages/RouteScanner.tsx → ScannerPanel.tsx`

Onglets `openapi|source` (Tabs violet `OpenAPI/Live URL Globe` vs `Source Code FileCode`) header `Route Scanner · OpenAPI+Source Sparkles`.

### 6.1 OpenAPI / Live URL
Section `LIVE SPEC Fetch & parse`. Input `https://api.example.com or http://localhost:3000/swagger.json` + `Scan` (spinner `Scanning…` + shimmer 3 skeletons). Erreur bande rouge `AlertTriangle`. Carte résultat : pill `detectedSpec` violet + `N endpoints` mono + titre raw + `Import as Collection →`. Vide `No endpoints found try /swagger.json /openapi.json` + hint CORS. Liste `max-h 380px` rang : `METHOD 64px mono coloré + path mono + summary + tag pill`. Tip `graphql POST /graphql introspection`.

Backend `api.scanner.scan(url)` tente `hostUrl(base)+/swagger.json|/openapi.json|/api-docs|/v3/api-docs|/swagger/v1/swagger.json` else GraphQL introspection `POST /graphql {__schema…}` → `{url,detectedSpec:'swagger'|'openapi'|'graphql'|'none',endpoints[],raw}`. `api.scanner.generate` groupe par `tag` → `Folder + RequestData` (`joinUrl` gère `/graphql` dedup).

### 6.2 Source Code (multi-lang)
Header `SOURCE SCAN`. Inputs : dossier projet + `Browse` (dialog Tauri) + `Detect` ; aperçu `Browse` warning amber si navigateur. Grille `Base URL http://localhost:3000 | API version prefix v1 | Collection name Framework API`. Carte détection si `detection|sourceResult` : pill langage violet + `Detected: Framework (X% confidence)` + barre confidence (green ≥85, amber <60, violet mid) + `N files · N routes + Root: file` + si low confidence panel `Forced framework` select `Express|Fastify|NestJS|Flask|FastAPI|Django|Laravel|Symfony|SpringBoot|AspNetCore|Gin|Echo|Fiber|Rails|Actix|Axum|Unknown` + `Re-scan`. Boutons `Scan Routes primary + Quick Scan & Import secondary + Export as OpenAPI (ml-auto) + Import N routes → + Watch for changes` pulse green. Scanning shimmer 4 skeletons. Erreur rouge, succès vert `Imported “Name” — N routes → outPath + View in Collections →`. Liste routes `max-h 420px` : `METHOD 64px | path mono | handler hidden lg | file:line mono | Lock amber si authRequired`. Preview `Will generate folders:` pills dédupliqués `split('/') filter !{:` . `ScanDiffPanel` via `diffScans(prev,cur) → added/removed/modified` + `BolaCandidatesList` (`/{id}` → BOLA) + `CoveragePanel`. Footer tip pipeline `Detect → parser Express/FastAPI/…Generic → regex AST → dedupe → folders/*.request.yaml` via `src-tauri/src/scanner/`.

Backend source : `scanner_detect_framework | scanner_scan_routes({includeComments,includeTests,maxFiles:2000,forcedFramework}) | scanner_generate_collection | scanner_quick_scan | scanner_get_last_scan | scanner_diff_scans | scanner_export_openapi | scanner_watch_start/stop/is_active` + events `scanner:watch-update|watch-error`, persistance `localStorage apiforge-last-scan`.

---

## 7. Mock Servers `pages/MockServers.tsx → MockServerPanel.tsx`

Header `Server violet Mock Server v2 + spec-driven · stateful · proxy/record · MCP + Refresh`.

**Form création** : `Name + Port + Mode mock|proxy|record + Target URL (proxy/record) + Mocks dir (optional)` + checkboxes `Stateful (SQLite) + GraphQL (operation name)` + aide `YAML: one *.mock.yaml per route · apiforge mock --file …`. `Create server` + erreur rouge.

**Liste** : skeleton si loading sinon vide dashed `No mock servers yet · Generate from OpenAPI Spec tab Each route *.mock.yaml — git-diffable` sinon carte par serveur `animate-fadeUp 32ms`: header expand `Route`, `name semibold`, `:port mono Radio`, pill `running(ping green)|stopped`, `mode`, `stateful violet`, boutons `Stop red-ghost / Start violet + Delete`. Déplié tabs `routes|hits|state|spec|mcp` violet actif:

- **routes `RouteEditor`** : header `Routes — one *.mock.yaml per route` + `Add Route`. Vide `No routes… Spec`. Carte rang : `METHOD select GET/…/GRAPHQL + path mono /users/{id} + status number + body mono + delay number + delete`. En dessous `Chaos` : `Latency jitter 0-5000 step100 ms violet + Error rate 0-50% step5 rouge` + hint `delay+random(0..jitter) 5xx on errorRate%`. Collapsible `Advanced — headers · variants · state` : `Headers JSON` textarea, `State {scope,operation,keyFrom}` textarea, variants `header:x-mock-variant=name` `add variant new-variant 400`.
- **hits** : `Refresh|Clear|Export JSON`, vide `No hits yet curl`, sinon `max-h 64` liste `method path status latency timestamp → matchedRoute` border green/amber/red.
- **state** : `key users:123 + value {"name":"Ada"} + Set|Clear|Refresh`, carte `State store (SQLite) N keys`, vide `POST /users creates users:{id}, GET reads it` sinon `key value truncate + ×`.
- **spec** : textarea `OpenAPI spec (paste JSON/YAML or file path)` 6 rows + `Generate mocks from spec` + `Pick file…` (dialog json/yaml) → `mock_generate_from_openapi(spec,…,true)` merge dedup `method:path` → toast `re-import diff`. Tip `Faker email/uuid/price, variants success/validation-error/server-error/empty-list`.
- **mcp** : `Agent-native local MCP tools` + boutons `mock_list_routes|mock_create_route|mock_set_state|mock_hit_log + Copy tools JSON + <pre> result` + tip `apiforge mcp --port {serverId}`.

**Modèle** : `MockServer {id,name,port,running,routes:MockRoute[],mode:'mock'|'proxy'|'record',targetUrl,stateEnabled,mocksDir,latencyMs,graphqlEnabled}` ; `MockRoute {id,method,path,status,body,delay,headers,variants:{name,status,body,headers,trigger}[],state:{scope,operation,keyFrom},chaosLatency,chaosErrorRate}`

**Backend** `api.mockServer` : `list|listV2|create|start|stop|update|delete|clearHits|exportHits|stateSnapshot|stateSet|stateClear|listRoutes|createRoute|updateRoute|deleteRoute|generateFromOpenapi|diffSpecs|mcpListTools|mcpCall` → Tauri `mock_*`.

---

## 8. Testing — Collection Runner `pages/Testing.tsx`

Header `FlaskConical violet Collection Runner + pulse green Running <name> in background… + X collections`.

**Contrôles** : Select `Collection [320px]` + `Mode Sequential|Parallel` + si parallel `Concurrency 1-20` + `Run N requests` violet / `Cancel` red-ghost + `JUnit|HTML` secondary si rows.

Alert si `requests.length===0` amber `This collection has no requests`. Progress violet bar `progress/total % 500ms` + `Timer X/Y — don’t block UI, Cancel`. Bande summary `N requests + passed green + failed red + P/F tests + Cancelled amber`. Chips history top 5 `runs` `collectionName · status · progress/total` violet actif.

**Table** `N requests` header `Status|Method|Name|URL|Time|Tests` `#0E0E10`. Vide `No runs yet Flask`. Rows `RunRow {id,name,method,url,status,ok,error,tests, durationMs}` `animate-fadeUp 14ms` border-left `red/green/gray`, Status pill `ERR red / code green 2xx red 4xx / loader`, METHOD mono coloré, URL mono + error mono `#070709`, `duration ms`, Tests pill `passed/total green/red/amber + Flaky amber` si `flakySet` (3+ runs mixte). 

**Logique** `CollectionRunner.tsx` : `flattenRequests([collection])` → `startRun({collectionId,name,mode,concurrency,total})` `run_Date_rand` → rows vides. `AbortController` + `setAbortController`. `accumulatedVars = workspaceStore.variables()` + `chainUpdates`. `executeOne(idx)` → `runPreRequestBrowser` (mut vars) → `api.requests.execute(effectiveReq, vars, runId)` → `runTestsBrowser` (`pm.test` Rhai) → `row`. Séquentiel boucle `await` ; parallèle pool `Math.min(pool,length)` workers `getNext` concurrency. `setProgress/updateRow` + final `completeRun cancelled|done` toasts `Ran N … passed/failed … tests`, chaînage vars `chainUpdates` merge env actif (crée manquants). `cancel()` → `abort + api.requests.cancel(runId) + cancelRun`.

**Exports** : `toJUnit` (XML échappé, failures `!ok + !passed`) + `toHTML` rapport stylé + blobs `URL.createObjectURL`.

**Backend** : `api.requests.execute` par requête + `requests:cancel` + `testExecutor` local + `testing:runRhai`.

---

## 9. Security `pages/SecurityPage.tsx` + `components/request/SecurityTab.tsx`

### 9.1 Page complète
Header shield violet `Security + N finding(s) · N open + Last scan: time · N req · Env mono + Filtered label X + Back to Workspace + Scan all (boucle tabs response → runPassiveScanForRequest) + Clear`.

Barre filtres `#0E0E10` : `Severity all|critical|high|medium|low|info + Category all|headers|auth|transport|exposure|injection + Status all|open|ignored|resolved + desktop Group by none|severity|endpoint|category + Search findings… 240px`.

Deux volets : gauche `ScanHistoryPanel` (liste scans `type timestamp env reqCount findingCount severityCounts pills`, select `selectedScanId` → filtre, delete/clear). Droite :
- Vide si `filtered.length===0` : si `totalActive===0` green `CheckCircle2 No security findings` + tip `Send→Scan` + `Run scan on all / Go to Workspace` ; sinon `ShieldAlert No findings match filters + Clear filters`.
- Sinon groupé : header sticky violet dot + `groupLabel` uppercase + count pill. Carte `bg #121215 hover #16161A` border-left `sevColor` 2px `ping` si hot : `SeverityPill` (hot ping dot) + `OWASP APIx:2023` mono + `category` pill + `StatusBadge open amber F59E0B / ignored gray / resolved green` + `Clock timestamp + endpoint mono bold + ExternalLink Workspace + description line-clamp 2 + Detected: localeString · Status + Ignore (prompt reason → ignored) + › detail`.

Clic → `FindingDetailDrawer` avec `evidenceRequest/Response`, `whyMatters`, `remediation`.

### 9.2 Onglet par requête `SecurityTab`
Header `Shield Security — this request N + method url` + warning prod rouge si `activeEnvName` `prod|live` sinon amber si non `local|dev`. Liste `getFindingsForRequest`. Vide `No issues for this request Run passive scan`. Chaque rang expand `Details Rule: ruleId·category + Evidence <pre> + Fix: remediation`. Bottom : `Run passive scan` secondary (180ms + sensitive env toast + fresh count) + `Test authorization (BOLA)` + `Open full Security page`.

**Modal BOLA** `AuthMatrixModal` : `METHOD url mono + copy`, description `Same request with two identities…`, inputs `Identity A token (owner) + Identity B token (attacker) + Use request auth → A`, `Run BOLA test` → `fetch(url,{method,headers:{...request.headers, Authorization:Bearer token}})` parallèle A/B, compare `status + body slice 2000` → toast `BOLA suspecté` si deux `2xx` égaux pas `401/403`. Affichage côte-à-côte status pill green/amber/red + `<pre>` body. Confirmation `Test BOLA against Prod?` si prod.

**Modèle** : `SecurityFinding {id,requestId,ruleId,title,description,severity:'critical'|'high'|'medium'|'low'|'info',category:'headers'|'auth'|'transport'|'exposure'|'injection',remediation,evidence,timestamp,dismissed,status:'open'|'ignored'|'resolved',owasp,endpoint,method}` ; `ScanRecord {id,type:'passive'|'bola'|'rate-limit'|'zap',timestamp,environment,requestCount,findingCount,severityCounts,findingIds,requestIds,label}` OWASP `BOLA→API1:2023, auth→API2, exposure→API7, injection→API3, transport→API8`.

**Logique** : `runPassiveScan(request,response)` vérifie headers manquants (`CSP`, `X-Frame-Options`, `HSTS`), cookie `Secure|HttpOnly|SameSite`, `CORS *`, stack traces, `http`, `?id=` injection. Local `securityStore` déduplique `requestId+ruleId`, `recordScan('passive', [id], findings, envName)`, `clear/dismiss/updateFindingStatus`.

---

## 10. History `pages/History.tsx`

**Sidebar 300px** : header `Clock History + N/M pill + Search URL,method,status… + Date grid 6 all|today|yesterday|7d|30d|custom (violet actif) + date inputs 2 cols si custom + Method chips GET…TRACE 8 violet actif sinon `METHOD_COLORS` + Status select All|2xx|3xx|4xx|5xx|Network/Error + Refresh spin + Clear + Pagination card Page X/Y + pageSize 10/25/50/100 + Prev/Next + tip. 

**Main** : header `Showing X of Y entries + filtered violet pill + Zap Click to expand…Add to workspace`. Corps `Group` par `formatDateGroup(ts)` sticky `Calendar N`. Rang `<li>` bouton expandable : `Chevron 7px violet si expand + METHOD 52px mono coloré + URL truncate mono 13px + P/B/H mini violet pills si params/body/headers + ×N hits gris + status 10px green/amber/red + responseTime ms + relativeTime + Star save` (→ `SaveToCollectionModal`). Déplié `animate-fadeUp` `bg #070709 border-top` : erreur amber `AlertCircle raw.error`, méta `status statusText + latency + date + Failed/Success pill`, grille 2 cols **Request** `#0E0E10` `METHOD url + Params mono violet + Headers + Body <pre tryPrettyJson>` + **Response** headers 24 scroll + Body `copy + char count + prettyJson` else `Empty response dashed`. Bottom `Save to collection Star + Add to workspace primary`.

**Footer pagination sticky** : `Prev|pages 5|Next|… total + count`, numeric violet actif, Prev/Next + scroll `smooth top0`. Tip `Merged ×N · click…star to save`.

**Transformation** : `HistoryItem → DedupedEntry via dedupeHistory` groupe `METHOD URL` → `{method,url,statusCode,responseTime,error,timestamp,hits,lastError}` ; `rawByKey Map `${METHOD} ${url}`` reconstruction `RequestData` (parse `requestHeaders JSON`, `requestParams JSON`, auth none). `relativeTime`, `startOfDay`, `getDateFilterRange`. Dedup `hits`. Pagination `pageSize 25 default`, `currentPage`, `paginated`, `grouped Map(date→rows)`.

**Actions** : `refresh() → api.requests.history(200)` ; `clearFilters()` ; `open(row)` → `toRequest(raw)` rebuild `RequestData` (uid fallback, method validé `HTTP_METHODS`, name `${METHOD} ${requestPath(url)}`, bodyType validé) ; déduplication `tabs.some(method+url)` → toast `Duplicated` sinon `Added to workspace` → `openRequest(req)` ; `Star → SaveToCollectionModal`.

**Backend** : `api.requests.history`, `api.collections.create`.

---

## 11. Route Scanner — voir §6 détaillé (OpenAPI + Source multi-lang, détection framework, watch, diff, BOLA candidates, coverage, export OpenAPI).

---

## 12. Settings `pages/Settings.tsx`

Sections `gap 5` `p-6` scroll `flex-1 overflow-auto` :

- **Appearance** : `Theme — APIro is dark-native only (OLED charcoal, Geist Sans) + Dark primary/second + Geist · JetBrains Mono · 200ms spring + Current: dark`
- **Fonts** : `Monospace (code & responses)` select `system|jetbrains|fira|sfmono|menlo` + `Font size 12|13(default)|14|16px` + note `UI Geist Sans -0.03em`
- **AI · OpenRouter** violet pill `optional` : texte `local heuristic — no cloud… Falls back to local` ; champs `API Key password sk-or-v1-…` eye toggle + `Show/Hide`, note `never sent to APIro servers + Get a key` ; `Model` select `AVAILABLE_MODELS` ; checkbox `Enable OpenRouter when key present` pill `Enabled green / Disabled gray` ; `Save OpenRouter primary + Clear ghost + Saved ✓` ; `Models ↗`
- **Zero-cloud** green border `Aucun compte requis, jamais. 0 forced cloud` flag + `APIro opens directly…100% local, Git-diffable + 0 deps at test time — Rust rhai engine Phase 4A`
- **About** `APIro 0.1.0 API Management, Reimagined — formerly APIForge + Local-first…Linear-inspired + Tauri v2, React 19, Typescript strict, Tailwind + pills Tauri v2|React 19|Geist`

Données : `uiStore {theme,codeFontFamily,codeFontSize}` + `localStorage apiro.openrouter:{apiKey,model,enabled}` via `getOpenRouterConfig()/save/clear`. Pas de backend.

---

## 13. Flow — Connection Flow `pages/Flow.tsx` (code intact, menu retiré 0.1.1)

**Statut :** `Sidebar` sans item ; `uiStore onRehydrateStorage` migre `flow→dashboard` ; `App.tsx` sans case `flow` → page inaccessible via UI mais composant intact.

Visualise graphe dépendances collections : nœuds = requêtes, arêtes = `sequence` (ordre dossier) + `authFlow` (auth partagée) + `dataFlow` (`{{var}}` producteur→consommateur via `analyzeFlow`).

Contrôles : header sticky `Network violet Connection Flow + X nodes·Y edges + impact active rouge si mode` ; droite `COLLECTION select All + dossiers depth — + Impact ON/OFF red/violet (Zap) + toggles Data #4d9fff / Auth #ffb224 / Seq #8B5CF6 Eye/EyeOff`. Stats bar `top 57px` : `impact downstream label — click a node` rouge + badges `N requests violet + N data-flow blue + N auth amber + N sequence gray + warning amber No connections detected…` + `hierarchical layout`. Canvas `FlowCanvas` : drag nodes, zoom scroll, pan, `▶ Play` walks sequence, export `SVG/PNG` via `applyLayout` + Rust `flow_export_svg`. `RequestNode` violet si selected / rouge pulse si impact, `FlowMinimap`, `FlowLegend`, `FlowEdges` dashed data, footer `Drag…zoom…pan…Play…export…200ms spring`.

Backend : `workspaceStore.collections + analyzeFlow({layout,includeSequence,includeAuth,includeDataFlow}) → FlowGraph {nodes:[{id,label,method,url,collectionId,position}],edges:[{from,to,edgeType}],layout}` ; `applyLayout` ; `flow_analyze|flow_export_svg` Rust.

---

## 14. Autres modules transverses

### 14.1 Seed Generator (Faker) `seed-generator.ts`
`generateFieldValue(fieldName)` context-aware `email|password|name|uuid|date|avatar|address…` via `@faker-js/faker` ; `generateBulkSeed(body, {strategy})` remplace placeholders ; history `seedHistory.ts` + `SeedButton Sparkles` + `EnvironmentCard`.

### 14.2 Auth & JWT
Types `None|API-Key|Bearer|Basic|Digest|OAuth2|JWT` (`shared/types/request.ts`). `AuthForm` + `JWT decode + expiry countdown` ; signatures `OAuth1/Hawk/AWS SigV4/NTLM` modélisées non calculées (△).

### 14.3 PDF / Docs `pdf-exporter.ts + ExportDialog`
`pdf-export:generate` → cover + TOC cliquable + tables endpoints + snippets multi-lang `cURL/JS/Python/Go/Java/PHP/Ruby` ; formats `PDF (Puppeteer Tauri, fallback printable HTML) | Markdown | HTML | OpenAPI YAML`. Wiring `CommandPalette Export Docs`.

### 14.4 AI Assistant `ai-assistant.ts`
Heuristique offline : suggestions fix `4xx/5xx`, starter tests, explications réponse ; pas de LLM cloud par design. Optionnel OpenRouter cloud (`Settings` key `sk-or-v1`) → modèles `AVAILABLE_MODELS`, fallback local si offline. Channels `ai-assistant:analyze`.

### 14.5 Mock — déjà §7 + CLI `apiforge mock --file ./mocks --port 3001 --mode record`

### 14.6 Git `components/git/GitPanel.tsx`
`workspace:info path,isGitRepo,branch + git:status(dir),diff(dir,path)` ; diff `max-h 48 overflow-auto 10px mono`, `8000 trunc`.

### 14.7 Stores synthèse

| Store | Persist | Contenu | Méthodes clés |
|---|---|---|---|
| `workspaceStore` | `apiforge-workspace workspacePath` | collections+environments SOT YAML/settings | `loadWorkspace, loadCollections, create/update/remove Collection, loadEnvironments, setActive` |
| `requestStore` | non | `tabs:RequestTab[] {id,request,response,loading}, activeTabId, testResults` | `openRequest, newTab, closeTab, updateRequest, send(id)` |
| `uiStore` | `apiforge-ui theme|sidebarOpen|zenMode|codeFontFamily|codeFontSize` | `activePage dashboard…settings`, font prefs | `setActivePage, setTheme(force dark), toggleZenMode, setCodeFontFamily/Size` |
| `collectionStore` | wrapper workspace | alias | `create,update,remove,upsertRequest,getById` |
| `environmentStore` | wrapper workspace | alias | `list/create/update/delete/setActive, variables` |
| `testingStore` | non | `runs max20 LIFO, activeRunId, rows/progress/isRunning/abortController` | `startRun, updateRow, setProgress, completeRun, cancelRun` |
| `securityStore` | non | `findings, scans, selected*` | `addFindings (dedup requestId+ruleId), dismiss/clear, runPassiveScanForRequest, recordScan, filteredFindings` |
| `notificationStore` | non | `toasts max3` | `addToast(variant,title,desc,duration) + auto dismiss` |

### 14.8 Services / Bridge `services/api.ts + tauri.ts + webBridge.ts`
`api.invoke(channel,args)` détecte `isTauri()→tauriInvokeMapped` sinon `window.api` sinon `getWebBridge()`. Channels : `collections:* | requests:execute/cancel/history | testing:runRhai | environments:* | scanner:* | seed:* | auth:decodeJWT | pdf-export:generate | workspace:info | git:* | mock:* | environments:import/export | collections:importRaw/export | ai:analyze | hostUrlFetch | flow_analyze/export_svg | yaml_read_tree/save_tree/replace_all`. `tauri.ts` 725 lignes mappe chaque channel vers Rust `settings_get/set`, `yaml_*`, `requests_execute`, `scanner_detect_framework`… ; `webBridge.ts` fallback navigateur `localStorage apiforge.web.collections|environments|history` + `fetch` + erreurs `Invalid URL→Failed to fetch (CORS hint)` + timeline zéro.

### 14.9 CLI & Tests
`npx tsx src/cli/index.ts run collection.json --env staging.json --output results.json --junit report.xml --concurrency 4` (non-zéro si fail). `npm test` Vitest 116 tests, `npm run typecheck` strict clean.

---

## 15. Architecture stockage

- **Collections YAML** chaque requête `*.request.yaml` `{name,method,url,headers:[{key,value,enabled}],params,bodyType,body}` + `settings_get('environments') JSON`. Cache `collectionsCache`. Git-diffable.
- **History** Rust `requests_history(limit 200)` SQLite `id,requestId,method,url,statusCode,responseTime,requestHeaders JSON,…` ; web LS `apiforge.web.history` slice 200.
- **Zustand persist** migration `light→dark`, `flow→dashboard`.

---

## 16. Limitations connues (PRODUCT)

Transports `WebSocket/SSE/MQTT/gRPC` UI HTTP-only (deps câblées) ; signing `OAuth1/Hawk/AWS SigV4/NTLM` modélisé non calculé ; collab temps-réel `WebRTC/RBAC` non implémenté (file/Git only) ; LLM local optionnel.

> **Aucun ne bloque le workflow** : build → scan/import → seed → test → mock → export → CI — tout offline.

---

*Généré le 2026-09-16 — reflète le code à `95b7219` (0.1.1, Flow menu retiré). Fichiers de référence : `src/renderer/src/styles/globals.css` design system, `src/renderer/tailwind.config.cjs` tokens.*

