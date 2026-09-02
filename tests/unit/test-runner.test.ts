import { describe, it, expect } from 'vitest';
import { runTests, runPreRequestScript } from '../../src/main/services/test-runner';
import type { RequestData, ResponseData, EnvironmentVariable } from '../../src/shared/types/request';

const baseRequest = (): RequestData => ({
  id: 'r',
  name: 'R',
  method: 'GET',
  url: 'http://x',
  headers: [],
  params: [],
  bodyType: 'none',
  body: '',
  auth: { type: 'none' },
});

const baseResponse = (over: Partial<ResponseData> = {}): ResponseData => ({
  id: 'res',
  statusCode: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  body: '{"id":1,"name":"x"}',
  contentType: 'application/json',
  responseTime: 12,
  size: 15,
  timeline: { dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, total: 12 },
  cookies: [],
  ...over,
});

const env = (entries: Record<string, string>): EnvironmentVariable[] =>
  Object.entries(entries).map(([key, value]) => ({ id: key, key, value, type: 'string' }));

describe('test-runner: runTests', () => {
  it('passes a status assertion', () => {
    const results = runTests(
      baseRequest(),
      baseResponse(),
      'pm.test("status 200", function () { pm.response.to.have.status(200); });',
      []
    );
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });

  it('fails an incorrect assertion and records the error', () => {
    const results = runTests(
      baseRequest(),
      baseResponse({ statusCode: 500 }),
      'pm.test("status 200", function () { pm.response.to.have.status(200); });',
      []
    );
    expect(results[0].passed).toBe(false);
    expect(results[0].error).toBeDefined();
    expect(results[0].error).toMatch(/200/);
  });

  it('supports pm.expect(...).to.equal on the json body', () => {
    const results = runTests(
      baseRequest(),
      baseResponse(),
      'pm.test("id equals 1", function () { pm.expect(pm.response.json().id).to.equal(1); });',
      []
    );
    expect(results[0].passed).toBe(true);
  });

  it('supports pm.expect(...).to.have.property', () => {
    const results = runTests(
      baseRequest(),
      baseResponse(),
      'pm.test("has name", function () { pm.expect(pm.response.json()).to.have.property("name"); });',
      []
    );
    expect(results[0].passed).toBe(true);
  });
});

describe('test-runner: runPreRequestScript', () => {
  it('returns variables set by the script', () => {
    const result = runPreRequestScript(
      'pm.environment.set("token", "xyz");',
      baseRequest(),
      env({ existing: 'v' })
    );
    const token = result.variables.find((v) => v.key === 'token');
    expect(token).toBeDefined();
    expect(token?.value).toBe('xyz');
    const existing = result.variables.find((v) => v.key === 'existing');
    expect(existing?.value).toBe('v');
  });

  it('preserves request mutations made before the script', () => {
    const req = baseRequest();
    req.url = 'http://modified';
    const result = runPreRequestScript('', req, []);
    expect(result.request.url).toBe('http://modified');
  });
});
