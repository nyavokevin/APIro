import type { KeyValuePair } from '@shared/types/request';

import { uid } from './id';

/**
 * Split a raw URL into its base part (everything before the query string),
 * the query string, and the hash fragment. Works with URLs that are missing
 * a protocol or contain template variables (e.g. "{{base_url}}/users"),
 * where `new URL()` would throw.
 */
function splitUrl(url: string): { base: string; query: string; hash: string } {
  const hashIndex = url.indexOf('#');
  let withoutHash = url;
  let hash = '';
  if (hashIndex !== -1) {
    hash = url.slice(hashIndex);
    withoutHash = url.slice(0, hashIndex);
  }
  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex === -1) {
    return { base: withoutHash, query: '', hash };
  }
  return { base: withoutHash.slice(0, queryIndex), query: withoutHash.slice(queryIndex + 1), hash };
}

function rowId(key: string, value: string): string {
  return `${key}=${value}`;
}

/**
 * Derive the params table from a URL's query string (URL -> params sync).
 *
 * Every key/value pair found in the query string becomes a row. Rows are
 * matched against `existing` by key+value so their id and enabled flag are
 * preserved (e.g. a row the user disabled stays disabled). Enabled rows that
 * no longer appear in the URL were removed by the user, so they are dropped;
 * disabled and empty (still-being-typed) rows are always kept.
 */
export function syncParamsFromUrl(url: string, existing: KeyValuePair[]): KeyValuePair[] {
  const { query } = splitUrl(url);
  const entries = query ? Array.from(new URLSearchParams(query).entries()) : [];

  const pool = new Map<string, KeyValuePair>();
  for (const p of existing) {
    const id = rowId(p.key, p.value);
    if (!pool.has(id)) pool.set(id, p);
  }

  const fromUrl: KeyValuePair[] = entries.map(([key, value]) => {
    const match = pool.get(rowId(key, value));
    return {
      id: match?.id ?? uid(),
      key,
      value,
      enabled: match?.enabled ?? true,
    };
  });

  const inUrl = new Set(entries.map(([key, value]) => rowId(key, value)));
  const kept = existing.filter(
    (p) => (!p.enabled || !p.key) && !inUrl.has(rowId(p.key, p.value))
  );

  return [...fromUrl, ...kept];
}

/**
 * Rebuild a URL from the params table (params -> URL sync). The base URL and
 * hash fragment are preserved as-is; the query string is replaced with the
 * enabled, non-empty params in table order (duplicate keys allowed).
 */
export function buildUrlFromParams(baseUrl: string, params: KeyValuePair[]): string {
  const { base, hash } = splitUrl(baseUrl);
  const query = params
    .filter((p) => p.enabled && p.key)
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
  if (!query) return base + hash;
  return `${base}?${query}${hash}`;
}
