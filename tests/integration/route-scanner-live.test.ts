import { describe, it, expect } from 'vitest';

const BASE = process.env.APIFORGE_TEST_URL ?? 'http://localhost:3000';
const CANDIDATES = ['/swagger.json', '/openapi.json', '/api-docs', '/v3/api-docs', '/swagger/v1/swagger.json'];

async function scanLive(base: string) {
  for (const c of CANDIDATES) {
    try {
      const r = await fetch(base.replace(/\/$/, '') + c);
      if (!r.ok) continue;
      const j = (await r.json()) as Record<string, unknown>;
      if (j && (j['swagger'] || j['openapi'] || j['paths'])) {
        const paths = (j['paths'] as Record<string, unknown>) ?? {};
        const endpoints: { method: string; path: string }[] = [];
        for (const [path, ops] of Object.entries(paths as Record<string, Record<string, unknown>>)) {
          for (const m of ['get','post','put','patch','delete','head','options'] as const) {
            if ((ops as Record<string,unknown>)[m]) endpoints.push({ method: m.toUpperCase(), path });
          }
        }
        return { matched: c, detectedSpec: (j['swagger'] ? 'swagger' : 'openapi') as string, endpoints, raw: j };
      }
    } catch { /* next */ }
  }
  return { matched: null, detectedSpec: 'none', endpoints: [], raw: null as unknown };
}

// This suite is skipped in CI unless LIVE=1 or --live is passed.
// It validates the python test backend against the *exact* scanner loop used by the UI.
describe.skipIf(process.env.LIVE !== '1' && process.env.CI)('route-scanner live (http://localhost:3000)', () => {
  it('discovers spec via /swagger.json candidates', async () => {
    // Cheap health probe: skip if backend not running
    let healthy = false;
    try {
      const h = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1500) });
      healthy = h.ok;
    } catch { healthy = false; }
    if (!healthy) {
      console.warn(`[live] backend not reachable at ${BASE} — skipping (start: python tools/api-test/backend/apiforge_test_backend.py)`);
      return;
    }

    const res = await scanLive(BASE);
    expect(res.matched).not.toBeNull();
    expect(res.detectedSpec).toBe('openapi');
    expect(res.endpoints.length).toBeGreaterThanOrEqual(10);
    const keys = new Set(res.endpoints.map(e => `${e.method} ${e.path}`));
    expect(keys.has('POST /v1/auth/login')).toBe(true);
    expect(keys.has('GET /v1/users')).toBe(true);
  });
});
