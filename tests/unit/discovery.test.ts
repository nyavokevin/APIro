import { describe, it, expect } from 'vitest';
import {
  resolveUrl,
  extractScriptSrcs,
  extractEndpoints,
  dedupeEndpoints,
} from '../../src/renderer/src/lib/discovery/extractApis';

const BASE = 'https://example.com/app';

describe('resolveUrl', () => {
  it('resolves relative paths against the base origin', () => {
    expect(resolveUrl('/api/users', BASE)?.toString()).toBe('https://example.com/api/users');
  });
  it('keeps absolute urls', () => {
    expect(resolveUrl('https://api.other.com/v1/x', BASE)?.toString()).toBe('https://api.other.com/v1/x');
  });
  it('rejects data/mailto/js and non-http', () => {
    expect(resolveUrl('data:image/png;base64,AAAA', BASE)).toBeNull();
    expect(resolveUrl('mailto:a@b.com', BASE)).toBeNull();
    expect(resolveUrl('javascript:void(0)', BASE)).toBeNull();
    expect(resolveUrl('ftp://x/y', BASE)).toBeNull();
  });
});

describe('extractScriptSrcs', () => {
  it('pulls and resolves script srcs, skipping source maps', () => {
    const html = `
      <script src="/static/main.js"></script>
      <script src="https://cdn.example.com/vendor.js"></script>
      <script src="/x.js.map"></script>
      <script>console.log('inline')</script>`;
    const srcs = extractScriptSrcs(html, BASE);
    expect(srcs).toContain('https://example.com/static/main.js');
    expect(srcs).toContain('https://cdn.example.com/vendor.js');
    expect(srcs.some((s) => s.endsWith('.map'))).toBe(false);
  });
});

describe('extractEndpoints', () => {
  it('captures explicit fetch/axios/XHR calls with methods', () => {
    const js = `
      fetch('/api/profile');
      axios.post('/api/login', body);
      client.delete(\`/api/items/42\`);
      xhr.open('PUT', '/api/items/42');
    `;
    const eps = extractEndpoints(js, BASE, 'script');
    const has = (method: string, path: string) => eps.some((e) => e.method === method && e.path === path && e.confidence === 'high');
    expect(has('GET', '/api/profile')).toBe(true);
    expect(has('POST', '/api/login')).toBe(true);
    expect(has('PUT', '/api/items/42')).toBe(true);
    expect(has('DELETE', '/api/items/42')).toBe(true);
  });

  it('captures bare API-shaped string literals as medium confidence', () => {
    const js = `const base = "/api/v2/orders"; const u = "https://pay.example.com/v1/charge";`;
    const eps = extractEndpoints(js, BASE, 'script');
    const paths = eps.map((e) => e.path);
    expect(paths).toContain('/api/v2/orders');
    expect(eps.find((e) => e.host === 'pay.example.com')).toBeTruthy();
    expect(eps.every((e) => e.confidence === 'medium')).toBe(true);
  });

  it('ignores static assets and non-api bare strings', () => {
    const js = `const img = "/images/logo.png"; const css = "/styles/app.css"; const label = "hello world";`;
    const eps = extractEndpoints(js, BASE, 'script');
    expect(eps).toHaveLength(0);
  });

  it('tags graphql endpoints', () => {
    const eps = extractEndpoints(`fetch('/graphql')`, BASE, 'script');
    expect(eps[0].kind).toBe('graphql');
  });
});

describe('dedupeEndpoints', () => {
  it('keeps the highest-confidence entry per method+url', () => {
    const high = extractEndpoints(`fetch('/api/x')`, BASE, 'script');
    const medium = extractEndpoints(`const a = "/api/x"`, BASE, 'html');
    const merged = dedupeEndpoints([...medium, ...high]);
    const x = merged.filter((e) => e.path === '/api/x');
    expect(x).toHaveLength(1);
    expect(x[0].confidence).toBe('high');
  });

  it('suppresses a bare GET guess when the same URL has an explicit call', () => {
    const eps = extractEndpoints(`axios.post('/api/login', b)`, BASE, 'script');
    const merged = dedupeEndpoints(eps);
    expect(merged.some((e) => e.method === 'GET' && e.path === '/api/login')).toBe(false);
    expect(merged.some((e) => e.method === 'POST' && e.path === '/api/login')).toBe(true);
  });
});
