import type { RequestData } from '@shared/types/request';

/** Names auto-assigned to fresh tabs ("New Request", "New Request 2", …). */
const DEFAULT_NAME = /^New Request( \d+)?$/;

/**
 * Extract the path (+ query) part of a URL for display in smart tab labels.
 * Tolerates relative ("api.example.com/users"), templated ("{{base}}/users")
 * and scheme-less URLs where `new URL()` would throw.
 */
export function requestPath(url: string): string {
  let rest = url.trim();
  if (!rest) return '';
  rest = rest.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const hashIdx = rest.indexOf('#');
  if (hashIdx !== -1) rest = rest.slice(0, hashIdx);
  const slashIdx = rest.indexOf('/');
  const path = slashIdx === -1 ? '/' : rest.slice(slashIdx);
  return path || '/';
}

/**
 * Smart tab label (mission spec: `[METHOD] URL-path`). Requests still named
 * with their auto-generated default display as their URL path instead;
 * anything the user named explicitly keeps its name.
 */
export function tabLabel(request: Pick<RequestData, 'name' | 'url'>): string {
  if (DEFAULT_NAME.test(request.name) && request.url.trim()) {
    // URLs without any path segment (bare hosts, pure templates like
    // "{{base_url}}") read better as-is than a bare "/".
    return request.url.includes('/') ? requestPath(request.url) : request.url;
  }
  return request.name;
}