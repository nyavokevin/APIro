import { describe, it, expect } from 'vitest';
import { analyzeError, generateTests, explainResponse } from '../../src/main/services/ai-assistant';
import type { RequestData, ResponseData } from '../../src/shared/types/request';

const baseResponse = (over: Partial<ResponseData> = {}): ResponseData => ({
  id: 'res',
  statusCode: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  body: '{"ok":true}',
  contentType: 'application/json',
  responseTime: 50,
  size: 12,
  timeline: { dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, total: 50 },
  cookies: [],
  ...over,
});

const baseRequest = (): RequestData => ({
  id: 'r',
  name: 'R',
  method: 'GET',
  url: 'http://localhost/api/users',
  headers: [],
  params: [],
  bodyType: 'none',
  body: '',
  auth: { type: 'none' },
});

describe('ai-assistant: analyzeError', () => {
  it('returns non-empty suggestions for a 404', async () => {
    const out = await analyzeError(baseResponse({ statusCode: 404, statusText: 'Not Found' }), baseRequest());
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/404|Not Found/i);
  });

  it('returns non-empty suggestions for a 500', async () => {
    const out = await analyzeError(
      baseResponse({ statusCode: 500, statusText: 'Internal Server Error' }),
      baseRequest()
    );
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/500|Internal Server Error/i);
  });
});

describe('ai-assistant: generateTests', () => {
  it('returns a script containing pm.test', async () => {
    const out = await generateTests(baseResponse({ statusCode: 200, body: '{"id":1,"name":"a"}' }));
    expect(typeof out).toBe('string');
    expect(out).toContain('pm.test');
    expect(out).toContain('pm.response.to.have.status(200)');
  });
});

describe('ai-assistant: explainResponse', () => {
  it('returns a non-empty explanation', async () => {
    const out = await explainResponse(baseResponse({ statusCode: 201, body: '{"id":2}' }));
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});
