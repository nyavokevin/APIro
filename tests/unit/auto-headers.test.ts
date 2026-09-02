import { describe, expect, it } from 'vitest';
import type { RequestData } from '../../src/shared/types/request';
import {
  AUTO_USER_AGENT,
  DEFAULT_AUTO_HEADERS,
  computeAutoHeaders,
} from '../../src/shared/lib/auto-headers';
import { HEADER_CATEGORIES, ALL_HEADER_NAMES } from '../../src/shared/constants/headers';

function makeRequest(overrides: Partial<RequestData> = {}): RequestData {
  return {
    id: 'r1',
    name: 'Test',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [],
    params: [],
    bodyType: 'none',
    body: '',
    auth: { type: 'none' },
    ...overrides,
  };
}

function keys(request: RequestData) {
  return computeAutoHeaders(request).map((h) => h.key);
}

describe('computeAutoHeaders (URL-independent defaults)', () => {
  it('always includes Host, the default headers, and Cookie', () => {
    expect(keys(makeRequest())).toEqual([
      'Host',
      'User-Agent',
      'Accept',
      'Accept-Encoding',
      'Connection',
      'Cookie',
    ]);
  });

  it('uses the APIForge user agent and standard default values', () => {
    const rows = computeAutoHeaders(makeRequest());
    const map = new Map(rows.map((h) => [h.key, h.value]));
    expect(map.get('User-Agent')).toBe(AUTO_USER_AGENT);
    expect(map.get('Accept')).toBe('*/*');
    expect(map.get('Accept-Encoding')).toBe('gzip, deflate, br');
    expect(map.get('Connection')).toBe('keep-alive');
    expect(DEFAULT_AUTO_HEADERS).toContainEqual(['User-Agent', AUTO_USER_AGENT]);
  });

  it('extracts the host and port from the URL', () => {
    const rows = computeAutoHeaders(
      makeRequest({ url: 'https://api.example.com:8443/users?page=1' })
    );
    expect(rows.find((h) => h.key === 'Host')?.value).toBe('api.example.com:8443');
  });

  it('keeps template variables in the Host value', () => {
    const rows = computeAutoHeaders(makeRequest({ url: '{{base_url}}/users' }));
    expect(rows.find((h) => h.key === 'Host')?.value).toBe('{{base_url}}');
  });
});

describe('computeAutoHeaders (body-related headers)', () => {
  it('adds Content-Type and Content-Length for JSON bodies', () => {
    const request = makeRequest({
      method: 'POST',
      bodyType: 'json',
      body: '{"name":"héllo"}',
    });
    const rows = computeAutoHeaders(request);
    const map = new Map(rows.map((h) => [h.key, h.value]));
    expect(map.get('Content-Type')).toBe('application/json');
    // UTF-8 byte length (é is 2 bytes), not character length (16 chars)
    expect(map.get('Content-Length')).toBe('17');
  });

  it('maps body types to the correct content types', () => {
    const cases: Array<[RequestData['bodyType'], string]> = [
      ['xml', 'application/xml'],
      ['text', 'text/plain'],
      ['urlencoded', 'application/x-www-form-urlencoded'],
      ['graphql', 'application/json'],
    ];
    for (const [bodyType, expected] of cases) {
      const rows = computeAutoHeaders(makeRequest({ method: 'POST', bodyType, body: 'x' }));
      expect(rows.find((h) => h.key === 'Content-Type')?.value).toBe(expected);
    }
  });

  it('marks multipart form-data values as computed at send time', () => {
    const rows = computeAutoHeaders(
      makeRequest({ method: 'POST', bodyType: 'form-data', body: 'k=v' })
    );
    const map = new Map(rows.map((h) => [h.key, h.value]));
    expect(map.get('Content-Type')).toContain('multipart/form-data');
    expect(map.get('Content-Length')).toBe('(auto)');
  });

  it('adds no Content-Length for bodyless methods and body types', () => {
    for (const method of ['GET', 'HEAD'] as const) {
      expect(keys(makeRequest({ method, bodyType: 'json', body: '{}' }))).not.toContain(
        'Content-Length'
      );
      // Content-Type still describes the payload the body type produces
      expect(keys(makeRequest({ method, bodyType: 'json', body: '{}' }))).toContain('Content-Type');
    }
    for (const bodyType of ['none', 'binary'] as const) {
      const ks = keys(makeRequest({ method: 'POST', bodyType }));
      expect(ks).not.toContain('Content-Length');
      expect(ks).not.toContain('Content-Type');
    }
  });

  it('prefers an exact contentLength option when provided', () => {
    const rows = computeAutoHeaders(
      makeRequest({ method: 'POST', bodyType: 'json', body: '{"a":1}' }),
      { contentLength: 42 }
    );
    expect(rows.find((h) => h.key === 'Content-Length')?.value).toBe('42');
  });

  it('reflects stored cookies on the Cookie row', () => {
    const rows = computeAutoHeaders(makeRequest(), { hasCookies: true });
    expect(rows.find((h) => h.key === 'Cookie')?.value).toBe('(stored cookies for this domain)');
  });
});

describe('computeAutoHeaders (user overrides)', () => {
  it('suppresses auto rows overridden by enabled user rows (case-insensitive)', () => {
    const request = makeRequest({
      headers: [
        { id: 'h1', key: 'user-agent', value: 'MyAgent/1.0', enabled: true },
        { id: 'h2', key: 'ACCEPT', value: 'application/xml', enabled: true },
      ],
    });
    const ks = keys(request);
    expect(ks).not.toContain('User-Agent');
    expect(ks).not.toContain('Accept');
    expect(ks).toContain('Connection');
  });

  it('keeps auto rows when the matching user row is disabled', () => {
    const request = makeRequest({
      headers: [{ id: 'h1', key: 'User-Agent', value: 'MyAgent/1.0', enabled: false }],
    });
    const rows = computeAutoHeaders(request);
    expect(rows.find((h) => h.key === 'User-Agent')?.value).toBe(AUTO_USER_AGENT);
  });

  it('marks each generated row with a description', () => {
    const rows = computeAutoHeaders(makeRequest());
    expect(rows.every((h) => h.description && h.description.length > 0)).toBe(true);
  });
});

describe('header presets', () => {
  it('covers every category from the spec', () => {
    expect(HEADER_CATEGORIES.map((c) => c.name)).toEqual([
      'Content & Body',
      'Authentication & Authorization',
      'Caching',
      'Client / Request Info',
      'CORS',
      'Connection & Transfer',
      'Custom / Other',
    ]);
  });

  it('includes the notable headers from each category', () => {
    const names = new Set(ALL_HEADER_NAMES);
    for (const name of [
      'Content-Type',
      'Content-Length',
      'Content-Encoding',
      'Content-Disposition',
      'Authorization',
      'Cookie',
      'WWW-Authenticate',
      'Proxy-Authorization',
      'Cache-Control',
      'ETag',
      'If-None-Match',
      'User-Agent',
      'Accept-Language',
      'Host',
      'Referer',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Allow-Origin',
      'Connection',
      'Transfer-Encoding',
      'X-Requested-With',
      'X-API-Key',
      'X-Forwarded-For',
      'X-Correlation-ID',
    ]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it('has unique header names across categories', () => {
    expect(ALL_HEADER_NAMES.length).toBe(new Set(ALL_HEADER_NAMES).size);
  });

  it('every preset carries an example value', () => {
    for (const category of HEADER_CATEGORIES) {
      for (const preset of category.headers) {
        expect(preset.example, `${category.name}/${preset.name}`).toBeTruthy();
      }
    }
  });
});