import { describe, expect, it } from 'vitest';

import type { KeyValuePair } from '../../src/shared/types/request';
import { buildUrlFromParams, syncParamsFromUrl } from '../../src/renderer/src/lib/urlParams';

function row(key: string, value: string, enabled = true): KeyValuePair {
  return { id: `${key}-${value}-${enabled}`, key, value, enabled };
}

describe('syncParamsFromUrl (URL -> params)', () => {
  it('lists params key and value from a full URL', () => {
    const params = syncParamsFromUrl('https://api.example.com/users?page=2&limit=10', []);
    expect(params.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled }))).toEqual([
      { key: 'page', value: '2', enabled: true },
      { key: 'limit', value: '10', enabled: true },
    ]);
  });

  it('works without a protocol (e.g. while typing)', () => {
    const params = syncParamsFromUrl('api.example.com/users?page=1&q=abc', []);
    expect(params.map((p) => p.key)).toEqual(['page', 'q']);
  });

  it('works with template variables like {{base_url}}', () => {
    const params = syncParamsFromUrl('{{base_url}}/users?api_key={{key}}', []);
    expect(params.map((p) => ({ key: p.key, value: p.value }))).toEqual([
      { key: 'api_key', value: '{{key}}' },
    ]);
  });

  it('returns no rows when the URL has no query string', () => {
    expect(syncParamsFromUrl('https://api.example.com/users', [])).toEqual([]);
    expect(syncParamsFromUrl('', [])).toEqual([]);
  });

  it('decodes encoded keys and values', () => {
    const params = syncParamsFromUrl('https://x.dev/search?q=a%20b&empty=', []);
    expect(params.map((p) => ({ key: p.key, value: p.value }))).toEqual([
      { key: 'q', value: 'a b' },
      { key: 'empty', value: '' },
    ]);
  });

  it('preserves ids and enabled state of matching rows', () => {
    const existing = [row('page', '2', false), row('limit', '10')];
    const params = syncParamsFromUrl('https://x.dev?page=2&limit=10', existing);
    expect(params.map((p) => ({ id: p.id, enabled: p.enabled }))).toEqual([
      { id: 'page-2-false', enabled: false },
      { id: 'limit-10-true', enabled: true },
    ]);
  });

  it('drops enabled rows that were removed from the URL', () => {
    const existing = [row('page', '2'), row('stale', 'yes')];
    const params = syncParamsFromUrl('https://x.dev?page=2', existing);
    expect(params.map((p) => p.key)).toEqual(['page']);
  });

  it('keeps disabled rows that are not in the URL', () => {
    const existing = [row('page', '2'), row('debug', '1', false)];
    const params = syncParamsFromUrl('https://x.dev?page=2', existing);
    expect(params.map((p) => ({ key: p.key, enabled: p.enabled }))).toEqual([
      { key: 'page', enabled: true },
      { key: 'debug', enabled: false },
    ]);
  });

  it('keeps empty rows the user is still typing', () => {
    const existing = [row('', '')];
    const params = syncParamsFromUrl('https://x.dev', existing);
    expect(params).toHaveLength(1);
  });

  it('ignores the hash fragment', () => {
    const params = syncParamsFromUrl('https://x.dev/page?a=1#section', []);
    expect(params.map((p) => p.key)).toEqual(['a']);
  });

  it('supports repeated keys', () => {
    const params = syncParamsFromUrl('https://x.dev?tag=a&tag=b', []);
    expect(params.map((p) => p.value)).toEqual(['a', 'b']);
  });
});

describe('buildUrlFromParams (params -> URL)', () => {
  it('appends enabled params as a query string', () => {
    const url = buildUrlFromParams('https://api.example.com/users', [
      row('page', '2'),
      row('limit', '10'),
      row('disabled', 'x', false),
      row('', 'empty-key'),
    ]);
    expect(url).toBe('https://api.example.com/users?page=2&limit=10');
  });

  it('replaces the existing query string', () => {
    const url = buildUrlFromParams('https://api.example.com/users?old=1', [row('page', '2')]);
    expect(url).toBe('https://api.example.com/users?page=2');
  });

  it('returns the bare URL when no enabled params exist', () => {
    expect(buildUrlFromParams('https://x.dev?a=1', [row('a', '1', false)])).toBe('https://x.dev');
  });

  it('preserves the hash fragment', () => {
    const url = buildUrlFromParams('https://x.dev/path?old=1#section', [row('a', '1')]);
    expect(url).toBe('https://x.dev/path?a=1#section');
  });

  it('encodes special characters', () => {
    const url = buildUrlFromParams('https://x.dev', [row('q', 'a b&c')]);
    expect(url).toBe('https://x.dev?q=a%20b%26c');
  });

  it('supports repeated keys', () => {
    const url = buildUrlFromParams('https://x.dev', [row('tag', 'a'), row('tag', 'b')]);
    expect(url).toBe('https://x.dev?tag=a&tag=b');
  });
});

describe('round-trip sync', () => {
  it('URL -> params -> URL is stable', () => {
    const url = 'https://api.example.com/users?page=2&limit=10&q=hello%20world';
    const params = syncParamsFromUrl(url, []);
    expect(buildUrlFromParams(url, params)).toBe(url);
  });

  it('params -> URL -> params is stable', () => {
    const params = [row('page', '2'), row('q', 'hello world')];
    const url = buildUrlFromParams('https://api.example.com/users', params);
    expect(syncParamsFromUrl(url, []).map((p) => ({ key: p.key, value: p.value }))).toEqual([
      { key: 'page', value: '2' },
      { key: 'q', value: 'hello world' },
    ]);
  });
});
