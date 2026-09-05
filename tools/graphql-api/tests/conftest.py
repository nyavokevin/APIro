"""
Shared fixtures — mirrors tools/api-test/tests/conftest.py
- `client` : FastAPI TestClient (no network)
- `live_server` : real uvicorn on http://localhost:4000 (for scanner fetch tests)
"""
import os
import time
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).parent.parent / "backend"
BASE_URL = os.getenv("APIFORGE_GRAPHQL_URL", "http://localhost:4000")


@pytest.fixture(scope="session")
def client():
    sys.path.insert(0, str(BACKEND_DIR.parent))
    # import as package: backend.app
    import backend.app as app_module
    with TestClient(app_module.app) as c:
        yield c


@pytest.fixture(scope="session")
def live_server():
    try:
        import httpx
        r = httpx.get(f"{BASE_URL}/health", timeout=1.0)
        if r.status_code == 200:
            yield BASE_URL
            return
    except Exception:
        pass

    env = os.environ.copy()
    env["PORT"] = str(BASE_URL.split(":")[-1])
    env["PYTHONIOENCODING"] = "utf-8"
    # run as module so relative imports work
    proc = subprocess.Popen(
        [sys.executable, "-m", "backend.app"],
        cwd=str(BACKEND_DIR.parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    import httpx
    deadline = time.time() + 12
    last_err = None
    while time.time() < deadline:
        if proc.poll() is not None:
            out = proc.stdout.read() if proc.stdout else ""
            pytest.fail(f"backend died on startup:\n{out}")
        try:
            r = httpx.get(f"{BASE_URL}/health", timeout=1.0)
            if r.status_code == 200:
                yield BASE_URL
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                return
        except Exception as e:
            last_err = e
        time.sleep(0.4)

    proc.terminate()
    pytest.fail(f"backend never became healthy at {BASE_URL}: {last_err}")


def pytest_addoption(parser):
    parser.addoption("--live", action="store_true", help="also run tests that need a live HTTP server")


def pytest_collection_modifyitems(config, items):
    for item in items:
        if "live" in item.keywords and not config.getoption("--live") and os.getenv("LIVE") != "1":
            item.add_marker(pytest.mark.skip(reason="need --live or LIVE=1 to run live server tests"))
