"""
Shared fixtures for APIForge Test Backend tests.

- `client`  : FastAPI TestClient (no network, in-process)
- `live_server` : real uvicorn process on http://localhost:3000  (for scanner fetch tests)
  started lazily via `pytest --live` or when `LIVE=1` env var is set.

The scanner in APIForge uses `fetch()` over HTTP, so we need a real TCP server to
validate discovery. For pure unit tests, use `client`.
"""

import os
import time
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_PATH = Path(__file__).parent.parent / "backend" / "apiforge_test_backend.py"
BASE_URL = os.getenv("APIFORGE_TEST_URL", "http://localhost:3000")

@pytest.fixture(scope="session")
def client():
    sys.path.insert(0, str(BACKEND_PATH.parent))
    import apiforge_test_backend as backend
    with TestClient(backend.app) as c:
        yield c

@pytest.fixture(scope="session")
def live_server():
    """
    Starts `uvicorn backend:3000` as subprocess if not already listening.
    Yields BASE_URL once /health responds 200.

    Skip (not fail) if port is occupied by non-test server or if --live not requested
    and LIVE env not set: we still try to spawn unless --no-live is passed.
    """
    # Check if already listening
    try:
        import httpx
        r = httpx.get(f"{BASE_URL}/health", timeout=1.0)
        if r.status_code == 200:
            yield BASE_URL
            return
    except Exception:
        pass

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.Popen(
        [sys.executable, str(BACKEND_PATH)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )
    # Wait for health
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
    if not config.getoption("--live") and os.getenv("LIVE") != "1":
        # mark but don't skip automatically; only skip those explicitly marked "live"
        pass
    for item in items:
        if "live" in item.keywords and not config.getoption("--live") and os.getenv("LIVE") != "1":
            item.add_marker(pytest.mark.skip(reason="need --live or LIVE=1 to run live server tests"))
