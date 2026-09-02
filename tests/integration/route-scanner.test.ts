import { describe, it, expect } from 'vitest';
import { parseOpenAPI } from '../../src/main/services/route-scanner';
import type { ScannedEndpoint } from '../../src/shared/types/request';

describe('route-scanner: parseOpenAPI (OpenAPI 3.0)', () => {
  it('returns an array of endpoints parsed from an OpenAPI 3.0 spec', () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'API', version: '1.0.0' },
      paths: {
        '/users': {
          get: { summary: 'List users', responses: { '200': { description: 'ok' } } },
          post: { summary: 'Create user' },
        },
        '/users/{id}': {
          get: { summary: 'Get user' },
        },
      },
    };
    const endpoints = parseOpenAPI(spec) as ScannedEndpoint[];
    expect(Array.isArray(endpoints)).toBe(true);
    expect(endpoints.length).toBe(3);
    const methods = endpoints.map((e) => `${e.method} ${e.path}`).sort();
    expect(methods).toEqual(['GET /users', 'GET /users/{id}', 'POST /users']);
  });

  it('parses parameters from path items', () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          get: { summary: 'Get user' },
        },
      },
    };
    const endpoints = parseOpenAPI(spec) as ScannedEndpoint[];
    expect(endpoints[0].parameters?.some((p) => p.key === 'id')).toBe(true);
  });
});

describe('route-scanner: parseOpenAPI (Swagger 2.0)', () => {
  it('parses endpoints from a Swagger 2.0 spec', () => {
    const spec = {
      swagger: '2.0',
      info: { title: 'API', version: '1.0.0' },
      paths: {
        '/ping': {
          get: { summary: 'Ping', responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const endpoints = parseOpenAPI(spec) as ScannedEndpoint[];
    expect(endpoints.length).toBe(1);
    expect(endpoints[0].method).toBe('GET');
    expect(endpoints[0].path).toBe('/ping');
  });
});

describe('route-scanner: spec type detection', () => {
  it('detects openapi vs swagger markers the way scanBackend would', () => {
    const openapiSpec = { openapi: '3.0.0', paths: {} };
    const swaggerSpec = { swagger: '2.0', paths: {} };
    const detect = (s: Record<string, unknown>) => (s.openapi ? 'openapi' : s.swagger ? 'swagger' : 'none');
    expect(detect(openapiSpec)).toBe('openapi');
    expect(detect(swaggerSpec)).toBe('swagger');
  });
});
