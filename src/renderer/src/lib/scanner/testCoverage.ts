import type { ScannedRoute } from '@shared/types/scanner';
import type { RequestData } from '@shared/types/request';

export interface CoverageResult {
  covered: ScannedRoute[];
  uncovered: ScannedRoute[];
  coveragePercent: number;
  total: number;
}

/**
 * Normalize a scanned route path like /users/{id} or /users/:id into a regex.
 * Handles:
 * - {param}, :param, {{var}} -> [^/]+
 * - trailing slash optional
 * - query string ignored
 */
export function routePathToRegex(routePath: string): RegExp {
  // Remove query string
  const withoutQuery = routePath.split('?')[0] ?? routePath;
  // Escape regex special chars except {, }, :, /
  // First, replace param placeholders with a sentinel, then escape, then restore
  let pattern = withoutQuery
    // Replace {{var}} (templated) -> __PARAM__
    .replace(/\{\{[^}]+\}\}/g, '__PARAM__')
    // Replace {param} -> __PARAM__
    .replace(/\{[^}]+\}/g, '__PARAM__')
    // Replace :param (e.g. :id, :userId) -> __PARAM__
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '__PARAM__');

  // Escape regex chars
  pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Restore param
  pattern = pattern.replace(/__PARAM__/g, '[^/]+');
  // Optional trailing slash
  if (!pattern.endsWith('/')) pattern = `${pattern}/?`;
  else pattern = `${pattern}?`;
  return new RegExp(`^${pattern}$`);
}

/**
 * Extract path from a request URL, handling:
 * - Full URL https://api.example.com/users/123?foo=bar -> /users/123
 * - Relative /users/123
 * - Templated /users/{{userId}} or /users/{{id}} -> /users/[^/]+
 * - Variables already resolved? We handle both by extracting path then normalizing.
 */
export function requestUrlToPath(requestUrl: string): string {
  const trimmed = requestUrl.trim();
  if (!trimmed) return '/';
  // Remove query string
  const withoutQuery = trimmed.split('?')[0] ?? trimmed;
  try {
    // Try to parse as URL to extract pathname
    const u = new URL(withoutQuery, 'http://dummy.base');
    // If original had no scheme/host, u.pathname will be the path
    // If original was templated like /users/{{id}}, URL will encode {{, so we need to handle
    let path = u.pathname;
    // URL encodes { as %7B, so decode
    try {
      path = decodeURIComponent(path);
    } catch {}
    return path || '/';
  } catch {
    // Fallback: treat as raw path
    const path = withoutQuery.split('?')[0] ?? withoutQuery;
    // Ensure leading slash
    return path.startsWith('/') ? path : `/${path}`;
  }
}

export function isRouteCovered(route: ScannedRoute, requests: RequestData[]): boolean {
  const routeMethod = route.method.toUpperCase();
  const regex = routePathToRegex(route.path);
  return requests.some((req) => {
    if (req.method.toUpperCase() !== routeMethod) return false;
    const reqPath = requestUrlToPath(req.url);
    // Also need to handle templated request URLs: replace {{var}} with placeholder then test
    // Our requestUrlToPath already handles {{var}} via regex placeholder, but we need to test both:
    // First try direct regex
    if (regex.test(reqPath)) return true;
    // Also try decoding and re-testing with templated normalization
    // Replace {{...}} in original url path with [^/]+ equivalent and test again
    const templatedPath = reqPath.replace(/\{\{[^}]+\}\}/g, '__PARAM__').replace(/__PARAM__/g, '123');
    // If original request had {{var}}, the above will have replaced and then we test against route regex with 123
    // Instead, we can test if route regex matches the templated path with 123
    if (regex.test(templatedPath)) return true;
    // Also handle :param style in request (less common)
    const colonPath = reqPath.replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '123');
    if (regex.test(colonPath)) return true;
    return false;
  });
}

export function computeCoverage(routes: ScannedRoute[], requests: RequestData[]): CoverageResult {
  const covered: ScannedRoute[] = [];
  const uncovered: ScannedRoute[] = [];
  for (const route of routes) {
    if (isRouteCovered(route, requests)) covered.push(route);
    else uncovered.push(route);
  }
  const total = routes.length;
  const coveragePercent = total === 0 ? 100 : Math.round((covered.length / total) * 100);
  return { covered, uncovered, coveragePercent, total };
}

// Helper for UI grouping
export function pathToFolder(path: string): string {
  const segs = path.split('/').filter((s) => s && !s.startsWith('{') && !s.startsWith(':') && !s.startsWith('{{'));
  const skip = segs.findIndex((s) => !s.startsWith('v') && isNaN(Number(s)) && s !== 'api');
  const name = segs[skip >= 0 ? skip : 0] ?? 'Root';
  return name.charAt(0).toUpperCase() + name.slice(1);
}
