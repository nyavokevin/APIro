import type { ScannedRoute } from '@shared/types/scanner';

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface BolaCandidate extends ScannedRoute {
  /** Human-readable reason why this is a candidate */
  reason: string;
  /** Risk heuristic based on method */
  risk: 'high' | 'medium' | 'low';
}

function hasPathParam(route: ScannedRoute): boolean {
  // Primary: explicit param location === 'path'
  if (route.params.some((p) => p.location === 'path')) return true;
  // Fallback: path contains :param or {param} pattern
  if (/[:{][a-zA-Z_][a-zA-Z0-9_]*[}]?/.test(route.path)) return true;
  // Also check for numeric/id-like segment
  if (/\/(?:\{id\}|\:id|\{userId\}|\:userId|\{resourceId\})/i.test(route.path)) return true;
  return false;
}

function isCandidateMethod(method: string): boolean {
  const m = method.toUpperCase();
  return !SAFE_METHODS.has(m);
}

export function isBolaCandidate(route: ScannedRoute): boolean {
  return route.authRequired && hasPathParam(route) && isCandidateMethod(route.method);
}

export function getBolaReason(route: ScannedRoute): string {
  const parts: string[] = [];
  if (route.authRequired) parts.push('auth');
  if (hasPathParam(route)) parts.push('ID in path');
  parts.push(route.method);
  return parts.join(' + ');
}

export function getBolaRisk(route: ScannedRoute): 'high' | 'medium' | 'low' {
  const m = route.method.toUpperCase();
  if (m === 'DELETE' || m === 'PUT' || m === 'PATCH') return 'high';
  if (m === 'POST') return 'medium';
  return 'low';
}

export function findBolaCandidates(routes: ScannedRoute[]): BolaCandidate[] {
  return routes
    .filter((r) => r.authRequired && hasPathParam(r) && !SAFE_METHODS.has(r.method.toUpperCase()))
    .map((r) => ({
      ...r,
      reason: getBolaReason(r),
      risk: getBolaRisk(r),
    }))
    // Also include GET etc. that are still interesting for IDOR read — but mark low
    .concat(
      routes
        .filter((r) => r.authRequired && hasPathParam(r) && SAFE_METHODS.has(r.method.toUpperCase()))
        .map((r) => ({
          ...r,
          reason: getBolaReason(r),
          risk: 'low' as const,
        }))
    )
    // Dedupe by METHOD:PATH, keep first
    .filter((r, idx, arr) => arr.findIndex((x) => `${x.method}:${x.path}` === `${r.method}:${r.path}`) === idx)
    // Sort high risk first, then by path
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 } as const;
      if (order[a.risk] !== order[b.risk]) return order[a.risk] - order[b.risk];
      return a.path.localeCompare(b.path);
    });
}

// For strict Phase 2 spec: only auth + path + not OPTIONS/HEAD
export function findStrictBolaCandidates(routes: ScannedRoute[]): BolaCandidate[] {
  return routes
    .filter(
      (r) =>
        r.authRequired &&
        r.params.some((p) => p.location === 'path') &&
        !['OPTIONS', 'HEAD'].includes(r.method.toUpperCase())
    )
    .map((r) => ({ ...r, reason: getBolaReason(r), risk: getBolaRisk(r) }));
}
