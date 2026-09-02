import { describe, it, expect } from 'vitest';
import {
  importCollection,
  parseCurl,
  parseOpenApi,
  parsePostman,
  parseHar,
  parseInsomnia,
} from '../../src/main/services/importers';
import type { Collection } from '../../src/shared/types/request';

function countRequests(c: Collection): number {
  if (c.type === 'request') return 1;
  return (c.children ?? []).reduce((acc, child) => acc + countRequests(child), 0);
}

function findFirstRequest(c: Collection): Collection | null {
  if (c.type === 'request') return c;
  for (const child of c.children ?? []) {
    const r = findFirstRequest(child);
    if (r) return r;
  }
  return null;
}

describe('importers', () => {
  it('parses a cURL command with method, headers, body and bearer auth', () => {
    const curl = `curl -X POST 'https://api.example.com/users' \\
      -H 'Content-Type: application/json' \\
      -H 'Authorization: Bearer xyz123' \\
      -d '{"name":"Ada"}'`;
    const req = parseCurl(curl);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://api.example.com/users');
    expect(req.bodyType).toBe('json');
    expect(req.body).toContain('Ada');
    expect(req.auth.type).toBe('bearer');
    expect(req.auth.bearer?.token).toBe('xyz123');
  });

  it('infers POST when -d is present without -X', () => {
    const req = parseCurl(`curl 'https://x.test/login' -d 'u=admin&p=secret'`);
    expect(req.method).toBe('POST');
    expect(req.bodyType).toBe('urlencoded');
  });

  it('parses OpenAPI 3.0 into tagged folders with requests', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Pet Store' },
      servers: [{ url: 'https://api.petstore.io' }],
      paths: {
        '/pets': {
          get: { tags: ['pets'], summary: 'List pets', responses: {} },
          post: { tags: ['pets'], summary: 'Create pet', responses: {} },
        },
        '/store': { get: { tags: ['store'], summary: 'Store', responses: {} } },
      },
    };
    const col = parseOpenApi(doc);
    expect(col.name).toBe('Pet Store');
    expect(countRequests(col)).toBe(3);
    const pets = col.children?.find((c) => c.name === 'pets');
    expect(pets).toBeTruthy();
  });

  it('parses Postman v2.1 flat and nested items', () => {
    const doc = {
      info: { name: 'My API' },
      item: [
        {
          name: 'Login',
          request: {
            method: 'POST',
            url: 'https://x.test/login',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: { mode: 'raw', raw: '{"u":"a"}' },
            auth: { type: 'bearer', bearer: [{ key: 'token', value: 'tok' }] },
          },
        },
        {
          name: 'Group',
          item: [{ name: 'Health', request: { method: 'GET', url: 'https://x.test/health' } }],
        },
      ],
    };
    const col = parsePostman(doc);
    expect(col.name).toBe('My API');
    expect(countRequests(col)).toBe(2);
    const login = findFirstRequest(col);
    expect(login?.data?.auth.type).toBe('bearer');
  });

  it('parses HAR entries', () => {
    const doc = {
      log: {
        entries: [
          { request: { method: 'GET', url: 'https://x.test/a', headers: [] } },
          {
            request: {
              method: 'POST',
              url: 'https://x.test/b',
              headers: [{ name: 'Content-Type', value: 'application/json' }],
              postData: { mimeType: 'application/json', text: '{"x":1}' },
            },
          },
        ],
      },
    };
    const col = parseHar(doc);
    expect(countRequests(col)).toBe(2);
  });

  it('parses Insomnia resource export', () => {
    const doc = {
      _type: 'workspace',
      name: 'Insomnia WS',
      resources: [
        { _type: 'request_group', _id: 'g1', name: 'Group' },
        { _type: 'request', _id: 'r1', parentId: 'g1', name: 'Get', method: 'GET', url: 'https://x.test/g' },
        { _type: 'request', _id: 'r2', name: 'Root', method: 'POST', url: 'https://x.test/r' },
      ],
    };
    const col = parseInsomnia(doc);
    const group = col.children?.find((c) => c.name === 'Group');
    expect(group?.children?.length).toBe(1);
    expect(countRequests(col)).toBe(2);
  });

  it('dispatches importCollection by auto-detection', () => {
    const curl = `curl 'https://x.test/ping'`;
    const col = importCollection(curl);
    expect(col.name).toContain('cURL');
    expect(countRequests(col)).toBe(1);
  });
});
