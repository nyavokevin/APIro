import type { ScannedRoute, SourceScanResult } from '@shared/types/scanner';

export interface FieldChange {
  field: string;
  oldValue: string;
  newValue: string;
}

export interface RouteChange {
  route: ScannedRoute;
  changes: FieldChange[];
}

export interface ScanDiff {
  added: ScannedRoute[];
  removed: ScannedRoute[];
  modified: RouteChange[];
}

function routeKey(r: ScannedRoute): string {
  return `${r.method.toUpperCase()}:${r.path}`;
}

function paramsSig(params: ScannedRoute['params']): string {
  return params.map((p) => `${p.name}:${p.location}:${p.required}`).sort().join('|');
}

export function diffScans(previous: SourceScanResult, current: SourceScanResult): ScanDiff {
  const prevMap = new Map<string, ScannedRoute>(previous.routes.map((r) => [routeKey(r), r]));
  const currMap = new Map<string, ScannedRoute>(current.routes.map((r) => [routeKey(r), r]));

  const prevKeys = new Set(prevMap.keys());
  const currKeys = new Set(currMap.keys());

  const added: ScannedRoute[] = [];
  const removed: ScannedRoute[] = [];
  const modified: RouteChange[] = [];

  for (const k of currKeys) {
    if (!prevKeys.has(k)) {
      const r = currMap.get(k);
      if (r) added.push(r);
    }
  }
  for (const k of prevKeys) {
    if (!currKeys.has(k)) {
      const r = prevMap.get(k);
      if (r) removed.push(r);
    }
  }
  for (const k of prevKeys) {
    if (currKeys.has(k)) {
      const pr = prevMap.get(k)!;
      const cr = currMap.get(k)!;
      const changes: FieldChange[] = [];
      if (pr.authRequired !== cr.authRequired) {
        changes.push({ field: 'auth_required', oldValue: String(pr.authRequired), newValue: String(cr.authRequired) });
      }
      if (pr.method !== cr.method) {
        changes.push({ field: 'method', oldValue: pr.method, newValue: cr.method });
      }
      if (paramsSig(pr.params) !== paramsSig(cr.params)) {
        changes.push({ field: 'params', oldValue: paramsSig(pr.params) || '(none)', newValue: paramsSig(cr.params) || '(none)' });
      }
      const prevBody = pr.bodySchema ?? '';
      const currBody = cr.bodySchema ?? '';
      if (prevBody !== currBody) {
        changes.push({ field: 'body_schema', oldValue: prevBody || '(none)', newValue: currBody || '(none)' });
      }
      if (changes.length > 0) {
        modified.push({ route: cr, changes });
      }
    }
  }

  added.sort((a, b) => a.path.localeCompare(b.path));
  removed.sort((a, b) => a.path.localeCompare(b.path));
  modified.sort((a, b) => a.route.path.localeCompare(b.route.path));

  return { added, removed, modified };
}

export function hasDiff(diff: ScanDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0;
}
