import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { generateMarkdown, generateOpenAPIYAML, generateCodeSnippet } from '../../src/main/services/pdf-exporter';
import type { Collection, EndpointView } from '../../src/shared/types/request';

// The source's generateOpenAPIYAML uses `require('yaml')`, which is undefined
// under native ESM. Provide a CJS require on the global object so the source
// call resolves (test harness shim, not a source change).
const requireFn = createRequire(import.meta.url);
(globalThis as unknown as { require: typeof requireFn }).require = requireFn;

const makeCollection = (): Collection => ({
  id: 'c1',
  name: 'My API',
  description: 'A sample collection',
  type: 'folder',
  createdAt: 0,
  updatedAt: 0,
  children: [
    {
      id: 'f1',
      name: 'Users',
      type: 'folder',
      createdAt: 0,
      updatedAt: 0,
      children: [
        {
          id: 'r1',
          name: 'List Users',
          type: 'request',
          createdAt: 0,
          updatedAt: 0,
          data: {
            id: 'req-1',
            name: 'List Users',
            method: 'GET',
            url: '/users',
            headers: [{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }],
            params: [],
            bodyType: 'none',
            body: '',
            auth: { type: 'none' },
          },
        },
        {
          id: 'r2',
          name: 'Create User',
          type: 'request',
          createdAt: 0,
          updatedAt: 0,
          data: {
            id: 'req-2',
            name: 'Create User',
            method: 'POST',
            url: '/users',
            headers: [],
            params: [],
            bodyType: 'json',
            body: '{"name":"a"}',
            auth: { type: 'none' },
          },
        },
      ],
    },
  ],
});

const baseOptions = { title: 'My API', version: '1.0.0', format: 'markdown' as const };

const makeEndpoint = (): EndpointView => ({
  method: 'POST',
  path: 'http://localhost/api/users',
  name: 'Create User',
  headers: [{ id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true }],
  params: [],
  body: '{"name":"a"}',
  bodyType: 'json',
});

describe('pdf-exporter: generateMarkdown', () => {
  it('includes the endpoint method and path', () => {
    const md = generateMarkdown(makeCollection(), baseOptions);
    expect(md).toContain('GET');
    expect(md).toContain('/users');
    expect(md).toContain('List Users');
  });
});

describe('pdf-exporter: generateOpenAPIYAML', () => {
  it('produces a YAML string starting with the openapi field', () => {
    const yaml = generateOpenAPIYAML(makeCollection());
    expect(typeof yaml).toBe('string');
    expect(yaml.trimStart().startsWith('openapi')).toBe(true);
  });
});

describe('pdf-exporter: generateCodeSnippet', () => {
  it('curl snippet contains curl', () => {
    const snippet = generateCodeSnippet(makeEndpoint(), 'curl');
    expect(snippet).toContain('curl');
  });

  it('python snippet contains requests', () => {
    const snippet = generateCodeSnippet(makeEndpoint(), 'python');
    expect(snippet).toContain('requests');
  });
});
