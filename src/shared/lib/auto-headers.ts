/**
 * Auto-generated ("hidden") headers.
 *
 * These are the headers APIForge adds to every request behind the scenes at
 * send time unless the user overrides them with an explicit enabled header
 * row. `computeAutoHeaders` is pure and shared between the main process
 * (which applies the defaults when building the real request) and the
 * renderer (which previews them in the Headers tab's "hidden headers"
 * section).
 */

import type { KeyValuePair, RequestBodyType, RequestData } from '../types/request';
import { CONTENT_TYPES } from '../constants/methods';
import { genId } from './id';

export const AUTO_USER_AGENT = 'APIForge/0.1.0';

/**
 * Defaults merged into every request by the HTTP client unless the user
 * defines the same header themselves. Host/Cookie are excluded here: Node
 * sets Host itself (it must follow redirects) and cookies come from the
 * cookie jar.
 */
export const DEFAULT_AUTO_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['User-Agent', AUTO_USER_AGENT],
  ['Accept', '*/*'],
  ['Accept-Encoding', 'gzip, deflate, br'],
  ['Connection', 'keep-alive'],
];

const BODY_CONTENT_TYPES: Partial<Record<RequestBodyType, string>> = {
  json: CONTENT_TYPES.JSON,
  xml: CONTENT_TYPES.XML,
  text: CONTENT_TYPES.TEXT,
  urlencoded: CONTENT_TYPES.URL_ENCODED,
  graphql: CONTENT_TYPES.JSON,
  'form-data': CONTENT_TYPES.FORM_DATA,
};

function byteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length;
}

/** Extract `host[:port]` from a URL, tolerating relative/templated URLs. */
function hostFromUrl(url: string): string {
  let base = url;
  const hashIdx = base.indexOf('#');
  if (hashIdx !== -1) base = base.slice(0, hashIdx);
  const queryIdx = base.indexOf('?');
  if (queryIdx !== -1) base = base.slice(0, queryIdx);
  base = base.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const slashIdx = base.indexOf('/');
  if (slashIdx !== -1) base = base.slice(0, slashIdx);
  return base.trim();
}

export interface AutoHeaderOptions {
  /** Exact body size in bytes, when the caller already encoded the body. */
  contentLength?: number;
  /** Whether the cookie jar holds cookies for this request's domain. */
  hasCookies?: boolean;
}

/**
 * Compute the list of auto-generated headers for a request. Headers whose
 * key is already defined by an enabled user row are omitted (user wins).
 */
export function computeAutoHeaders(
  request: Pick<RequestData, 'method' | 'url' | 'bodyType' | 'body' | 'headers'>,
  options: AutoHeaderOptions = {}
): KeyValuePair[] {
  const userKeys = new Set(
    request.headers.filter((h) => h.enabled && h.key).map((h) => h.key.toLowerCase())
  );
  const rows: KeyValuePair[] = [];
  const push = (key: string, value: string, description: string) => {
    if (userKeys.has(key.toLowerCase())) return;
    rows.push({ id: genId(), key, value, enabled: true, description });
  };

  push('Host', hostFromUrl(request.url) || '(auto)', 'Destination host and port');

  const contentType = BODY_CONTENT_TYPES[request.bodyType];
  if (contentType) {
    push(
      'Content-Type',
      request.bodyType === 'form-data' ? `${contentType}; boundary=(auto)` : contentType,
      `Set from the ${request.bodyType} body type`
    );
  }

  const sendsBody =
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    request.bodyType !== 'none' &&
    request.bodyType !== 'binary';
  if (sendsBody) {
    push(
      'Content-Length',
      request.bodyType === 'form-data' ? '(auto)' : String(options.contentLength ?? byteLength(request.body)),
      'Body size in bytes, computed at send time'
    );
  }

  for (const [key, value] of DEFAULT_AUTO_HEADERS) {
    push(key, value, 'Default header, added unless overridden above');
  }

  push(
    'Cookie',
    options.hasCookies ? '(stored cookies for this domain)' : '(cookie jar)',
    'Added at send time if cookies are stored for this domain'
  );

  return rows;
}