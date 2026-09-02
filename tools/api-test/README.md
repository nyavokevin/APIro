# APIForge — Route Scanner Test Backend

Mini-lab pour valider le **Route Scanner** d'APIForge contre un vrai serveur OpenAPI.

```
tools/api-test/
├── backend/
│   ├── apiforge_test_backend.py   # FastAPI server (port 3000)
│   └── requirements.txt
├── tests/
│   ├── test_scanner.py            # Scanner discovery (candidates) + OpenAPI parsing
│   ├── test_api_features.py       # CRUD / auth / errors / seed
│   └── conftest.py                # fixtures: live server + client
├── run.ps1                        # One-shot runner (install + start + test)
└── README.md
```

## Quick start

```powershell
# 1. Installer deps
pip install -r backend/requirements.txt

# 2. Lancer le backend seul
python backend/apiforge_test_backend.py
# → http://localhost:3000  Docs http://localhost:3000/docs  Swagger http://localhost:3000/swagger.json

# 3. Runner complet (backend éphémère + pytest)
powershell -ExecutionPolicy Bypass -File run.ps1
# ou
pytest tests -v
```

## Ce que teste le scanner

| Scanner step | Route backend | Attendu |
|---|---|---|
| `GET /swagger.json` | `backend: swagger_spec()` | `openapi: 3.x` avec `paths` |
| `GET /openapi.json` | `openapi_spec()` | alias du précédent |
| `GET /api-docs` / `GET /v3/api-docs` | `api_docs()` | alias |
| `GET /swagger/v1/swagger.json` | 404 (volontaire) | scanner passe au suivant |
| Détection `openapi` vs `swagger` vs `none` | `detectSpec()` | |
| Parse `paths` → `ScannedEndpoint[]` | `parseOpenAPI()` | méthodes GET/POST/PUT/PATCH/DELETE |

La logique du scanner côté APIForge (`src/renderer/src/services/tauri.ts:scanBackend` et `webBridge.ts:scan`) tente les 4 candidats dans l'ordre, s'arrête au premier qui renvoie `{ openapi|swagger, paths }`, puis construit `ScanResult { detectedSpec, endpoints, raw }` et `generateFromScan()` crée une Collection.

## Intégration avec APIForge

1. Lance le backend: `python tools/api-test/backend/apiforge_test_backend.py`
2. Ouvre APIForge → **Route Scanner**
3. Saisis `http://localhost:3000` → **Scan** → doit afficher `openapi · N endpoints` (ex: 18)
4. **Import** → vérifie dans **Collections** que `Scanned Collection` contient les dossiers `Auth`, `Users`, `Products`, …
5. Dans la **Connection Flow** les requêtes importées doivent former un graph séquentiel.

## Troubleshooting

- `CORS`: le backend autorise `allow_origins=["*"]`
- `Port 3000 occupé`: `netstat -ano | findstr :3000` puis `taskkill /PID <pid> /F`, ou lance avec `PORT=4000 python ...`
- `pytest: TestClient not found`: `pip install httpx` (déjà dans requirements)
