import type { HttpMethod } from '@shared/types/request';

export type DiscoverySource = 'html' | 'inline-script' | 'script';
export type DiscoveryKind = 'rest' | 'graphql';
export type DiscoveryConfidence = 'high' | 'medium' | 'low';

export interface DiscoveredEndpoint {
  method: HttpMethod;
  url: string;
  path: string;
  host: string;
  kind: DiscoveryKind;
  source: DiscoverySource;
  confidence: DiscoveryConfidence;
  evidence: string;
}

const ASSET_EXT = /\.(js|mjs|cjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|mp4|webm|mp3|wav|pdf|zip|gz)(\?|#|$)/i;

function toMethod(raw: string): HttpMethod {
  const m = raw.toUpperCase();
  const all: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];
  return all.includes(m as HttpMethod) ? (m as HttpMethod) : 'GET';
}

/** Resolve a raw URL/path against a base; returns null for non-http or unparseable values. */
export function resolveUrl(raw: string, baseUrl: string): URL | null {
  const r = raw.trim();
  if (!r || r.startsWith('data:') || r.startsWith('#') || r.startsWith('mailto:') || r.startsWith('javascript:')) return null;
  // Skip template-y strings that aren't resolvable paths.
  if (r.startsWith('${') || r.includes('\n')) return null;
  try {
    const u = new URL(r, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function looksLikeApi(u: URL): boolean {
  const p = u.pathname.toLowerCase();
  if (/(^|\/)(api|graphql|rest|rpc|gql)(\/|$)/.test(p)) return true;
  if (/\/v\d+(\/|$)/.test(p)) return true;
  if (/\/(users?|auth|login|logout|token|oauth|account|orders?|products?|cart|checkout|payments?|session|me|search|upload|webhook)(\/|$)/.test(p)) return true;
  if (u.search.length > 0 && !ASSET_EXT.test(p)) return true;
  return false;
}

function kindOf(u: URL): DiscoveryKind {
  return /graphql|\/gql(\/|$)/i.test(u.pathname) ? 'graphql' : 'rest';
}

/** Pull `<script src>` URLs out of an HTML document, resolved to absolute URLs. */
export function extractScriptSrcs(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = resolveUrl(m[1], baseUrl);
    if (u && !/\.map(\?|#|$)/i.test(u.pathname)) out.add(u.toString());
  }
  return [...out];
}

interface RawHit {
  method?: string;
  raw: string;
  evidence: string;
  explicit: boolean; // came from a fetch/axios/XHR call, not a bare string
}

function collectHits(text: string): RawHit[] {
  const hits: RawHit[] = [];
  const push = (raw: string, evidence: string, explicit: boolean, method?: string) => {
    if (raw) hits.push({ raw, evidence: evidence.slice(0, 140), explicit, method });
  };

  // axios-style / client.get("…"), http.post(`…`)
  const call = /\.(get|post|put|patch|delete|head|options)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;
  let m: RegExpExecArray | null;
  while ((m = call.exec(text)) !== null) push(m[2], m[0], true, m[1]);

  // fetch("…")
  const fetchRe = /fetch\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;
  while ((m = fetchRe.exec(text)) !== null) push(m[1], m[0], true);

  // XMLHttpRequest.open("METHOD", "url")
  const xhr = /\.open\s*\(\s*[`'"]([A-Za-z]+)[`'"]\s*,\s*[`'"]([^`'"]+)[`'"]/gi;
  while ((m = xhr.exec(text)) !== null) push(m[2], m[0], true, m[1]);

  // Bare string literals that look like API paths or absolute URLs.
  const bare = /[`'"]((?:\/[A-Za-z0-9._~\-/]*(?:api|graphql|rest|v\d+)[A-Za-z0-9._~\-/]*)|https?:\/\/[^`'"\s]+)[`'"]/gi;
  while ((m = bare.exec(text)) !== null) push(m[1], m[1], false);

  return hits;
}

/** Extract candidate API endpoints from a blob of text (HTML or JS). */
export function extractEndpoints(text: string, baseUrl: string, source: DiscoverySource): DiscoveredEndpoint[] {
  const out: DiscoveredEndpoint[] = [];
  for (const hit of collectHits(text)) {
    const u = resolveUrl(hit.raw, baseUrl);
    if (!u) continue;
    if (ASSET_EXT.test(u.pathname)) continue;
    const api = looksLikeApi(u);
    // Keep explicit calls even if the path is generic; require api-shape for bare strings.
    if (!hit.explicit && !api) continue;
    out.push({
      method: toMethod(hit.method ?? 'GET'),
      url: u.toString(),
      path: u.pathname + u.search,
      host: u.host,
      kind: kindOf(u),
      source,
      confidence: hit.explicit ? 'high' : api ? 'medium' : 'low',
      evidence: hit.evidence,
    });
  }
  return out;
}

/** Merge endpoints, keeping the highest-confidence entry per method+url. */
export function dedupeEndpoints(endpoints: DiscoveredEndpoint[]): DiscoveredEndpoint[] {
  const rank: Record<DiscoveryConfidence, number> = { high: 3, medium: 2, low: 1 };
  const byKey = new Map<string, DiscoveredEndpoint>();
  for (const e of endpoints) {
    const key = `${e.method} ${e.url}`;
    const existing = byKey.get(key);
    if (!existing || rank[e.confidence] > rank[existing.confidence]) byKey.set(key, e);
  }
  // Drop bare-string GET guesses for a URL already seen as an explicit (high) call —
  // e.g. a `POST /api/login` call also leaves a "/api/login" literal that looks like a GET.
  const highUrls = new Set([...byKey.values()].filter((e) => e.confidence === 'high').map((e) => e.url));
  const result = [...byKey.values()].filter(
    (e) => !(e.confidence !== 'high' && e.method === 'GET' && highUrls.has(e.url))
  );
  return result.sort((a, b) => {
    const r = rank[b.confidence] - rank[a.confidence];
    return r !== 0 ? r : a.url.localeCompare(b.url);
  });
}
