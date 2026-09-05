/**
 * Browser fallback bridge.
 *
 * APIForge is an Electron app: the real `window.api` is provided by the
 * preload script. When the UI is opened outside Electron (e.g. the Vite dev
 * server in a plain browser, or CI previews) that bridge is absent. This module
 * implements the same `window.api` surface entirely in the renderer using
 * `localStorage` for persistence and `fetch` for requests, so the app stays
 * fully usable without the main process. Features that fundamentally require a
 * Node/Electron runtime (real PDF via Puppeteer, a listening mock server, the
 * CLI) degrade gracefully.
 */
import { genId } from '../../../shared/lib/id';
import { resolveVariables } from '../../../main/services/variable-resolver';
import { generateFieldValue, generateBulkSeed } from '../../../main/services/seed-generator';
import { importCollection } from '../../../main/services/importers';
import { parseEnvironment } from '../../../main/services/environment-parsers';
import { exportEnvironment } from '../../../main/services/environment-exporters';
import { exportCollection as exportCollectionFn } from '../../../main/services/collection-exporters';
import type {
  Collection,
  Environment,
  EnvironmentVariable,
  RequestData,
  ResponseData,
  ScanResult,
  ScannedEndpoint,
  PdfExportOptions,
  MockServer,
  AIAnalyzePayload,
  AIAnalyzeResult,
} from '@shared/types/request';

const LS_KEYS = {
  collections: 'apiforge.web.collections',
  environments: 'apiforge.web.environments',
  history: 'apiforge.web.history',
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ----------------------------- collections ----------------------------- */

function findNode(nodes: Collection[], id: string): Collection | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
}
function removeNode(nodes: Collection[], id: string): Collection[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.children ? { ...n, children: removeNode(n.children, id) } : n));
}
function updateNode(nodes: Collection[], id: string, patch: Partial<Collection>): Collection[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    if (n.children) return { ...n, children: updateNode(n.children, id, patch) };
    return n;
  });
}

function collections(): Collection[] {
  return readJSON<Collection[]>(LS_KEYS.collections, []);
}
function persistCollections(nodes: Collection[]): void {
  writeJSON(LS_KEYS.collections, nodes);
}

/* ----------------------------- environments ----------------------------- */

function environments(): Environment[] {
  return readJSON<Environment[]>(LS_KEYS.environments, []);
}

/* ----------------------------- request send ----------------------------- */

function buildUrl(req: RequestData): string {
  const enabled = req.params.filter((p) => p.enabled && p.key);
  if (enabled.length === 0) return req.url;
  try {
    const u = new URL(req.url);
    for (const p of enabled) u.searchParams.set(p.key, p.value);
    return u.toString();
  } catch {
    const qs = enabled.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return req.url.includes('?') ? `${req.url}&${qs}` : `${req.url}?${qs}`;
  }
}

function headersToObject(headers: RequestData['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) if (h.enabled && h.key) out[h.key] = h.value;
  return out;
}

async function executeRequest(
  request: RequestData,
  variables: EnvironmentVariable[] = []
): Promise<ResponseData> {
  const resolved: RequestData = {
    ...request,
    url: resolveVariables(request.url, variables),
    headers: request.headers.map((h) => ({ ...h, key: resolveVariables(h.key, variables), value: resolveVariables(h.value, variables) })),
    params: request.params.map((p) => ({ ...p, key: resolveVariables(p.key, variables), value: resolveVariables(p.value, variables) })),
    body: resolveVariables(request.body, variables),
  };
  const url = buildUrl(resolved);
  const headers = headersToObject(resolved.headers);
  const init: RequestInit = { method: resolved.method, headers };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(resolved.method) && resolved.body) {
    init.body = resolved.body;
  }
  const start = performance.now();
  const blank = (): ResponseData => ({
    id: genId(),
    statusCode: 0,
    statusText: 'Network Error',
    headers: {},
    body: '',
    contentType: '',
    responseTime: 0,
    size: 0,
    timeline: { dns: 0, tcp: 0, tls: 0, ttfb: 0, download: 0, total: 0 },
    cookies: [],
  });

  // Validate URL before fetch — catches "http:/" etc.
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    const elapsed = Math.round(performance.now() - start);
    const err = { ...blank(), statusText: 'Invalid URL', responseTime: elapsed, timeline: { dns: 0, tcp: 0, tls: 0, ttfb: elapsed, download: 0, total: elapsed }, error: 'URL is empty. Enter a full URL like https://api.example.com/endpoint', body: 'URL is empty' };
    try { saveHistory(resolved, err); } catch {}
    return err;
  }
  try {
    // Will throw for malformed URLs like "http:/"
    new URL(trimmedUrl);
  } catch {
    const elapsed = Math.round(performance.now() - start);
    const msg = `Invalid URL: "${trimmedUrl}". Expected format like https://api.example.com/path — got "${trimmedUrl.slice(0, 80)}"`;
    const err = { ...blank(), statusText: 'Invalid URL', responseTime: elapsed, timeline: { dns: 0, tcp: 0, tls: 0, ttfb: elapsed, download: 0, total: elapsed }, error: `${msg}. Check the scheme (https://) and host.`, body: msg };
    try { saveHistory(resolved, err); } catch {}
    return err;
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    const elapsed = Math.round(performance.now() - start);
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => (respHeaders[k] = v));
    const response: ResponseData = {
      ...blank(),
      id: genId(),
      statusCode: res.status,
      statusText: res.statusText,
      headers: respHeaders,
      body: text,
      contentType: respHeaders['content-type'] ?? '',
      responseTime: elapsed,
      size: new Blob([text]).size,
      timeline: { dns: 0, tcp: 0, tls: 0, ttfb: elapsed, download: 0, total: elapsed },
      cookies: [],
      error: undefined,
    };
    saveHistory(resolved, response);
    return response;
  } catch (e) {
    const elapsed = Math.round(performance.now() - start);
    const raw = e instanceof Error ? e.message : String(e);
    const isInvalidUrl = /Failed to parse URL|Invalid URL/i.test(raw);
    const isNetwork = /Failed to fetch|NetworkError|Network request failed/i.test(raw);
    let hint: string;
    let statusText = 'Network Error';
    if (isInvalidUrl) {
      statusText = 'Invalid URL';
      hint = `The URL "${trimmedUrl.slice(0, 80)}" is malformed. Use https://host/path format — e.g. https://api.example.com/users`;
    } else if (isNetwork) {
      hint =
        'This is almost always a CORS or network block enforced by the browser. ' +
        'Third-party APIs (e...g coinmarketcap.com) must send `Access-Control-Allow-Origin` ' +
        'to be callable from a browser. Run APIForge via `npm run tauri:dev` so the request is sent from Rust with no CORS restriction.';
    } else {
      hint = 'Check the URL, TLS certificate, and that the host is reachable.';
    }
    const errRes = { ...blank(), statusText, responseTime: elapsed, timeline: { dns: 0, tcp: 0, tls: 0, ttfb: elapsed, download: 0, total: elapsed }, error: `${raw}. ${hint}`, body: raw };
    try { saveHistory(resolved, errRes); } catch {}
    return errRes;
  }
}

function saveHistory(req: RequestData, res: ResponseData): void {
  const hist = readJSON<any[]>(LS_KEYS.history, []);
  hist.unshift({
    id: genId(),
    requestId: req.id ?? null,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode || null,
    responseTime: res.responseTime || null,
    requestHeaders: JSON.stringify(req.headers),
    responseHeaders: JSON.stringify(res.headers),
    responseBody: res.body,
    error: res.error ?? null,
    timestamp: Date.now(),
    requestParams: JSON.stringify(req.params ?? []),
    requestBody: req.body ?? '',
    requestBodyType: req.bodyType ?? 'none',
  });
  writeJSON(LS_KEYS.history, hist.slice(0, 200));
}

/* ----------------------------- route scanner ----------------------------- */

function buildScanResult(baseUrl: string, spec: any): ScanResult {
  const paths: Record<string, any> = spec.paths ?? {};
  const endpoints: ScannedEndpoint[] = [];
  for (const [path, ops] of Object.entries<any>(paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const) {
      const op = ops?.[method];
      if (!op) continue;
      endpoints.push({
        method: method.toUpperCase() as ScannedEndpoint['method'],
        path,
        summary: op.summary,
        description: op.description,
        tags: op.tags,
        parameters: (op.parameters ?? []).map((p: any) => ({
          id: genId(),
          key: p.name,
          value: '',
          enabled: true,
          description: p.in,
        })),
      });
    }
  }
  return { url: baseUrl, detectedSpec: spec.swagger ? 'swagger' : 'openapi', endpoints, raw: spec };
}

function hostUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  try {
    const u = new URL(trimmed);
    let pathname = u.pathname.replace(/\/$/, '');
    if (pathname.toLowerCase().endsWith('/graphql')) {
      pathname = pathname.slice(0, -'/graphql'.length);
    }
    const origin = u.origin;
    if (!pathname || pathname === '/') return origin;
    return origin + pathname.replace(/\/$/, '');
  } catch {
    let url = trimmed.replace(/\/$/, '');
    if (url.toLowerCase().endsWith('/graphql')) url = url.slice(0, -'/graphql'.length);
    return url.replace(/\/$/, '');
  }
}

const GRAPHQL_INTROSPECTION = `query IntrospectionQuery { __schema { queryType { name fields { name } } mutationType { name fields { name } } } }`;

async function tryGraphQLFetch(baseUrl: string): Promise<ScannedEndpoint[]> {
  const url = hostUrl(baseUrl) + '/graphql';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GRAPHQL_INTROSPECTION }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const schema = json?.data?.__schema;
    if (!schema) return [];
    const endpoints: ScannedEndpoint[] = [];
    for (const t of [schema.queryType, schema.mutationType]) {
      if (!t || !Array.isArray(t.fields)) continue;
      for (const f of t.fields) {
        endpoints.push({ method: 'POST', path: '/graphql', summary: String(f.name), tags: ['graphql'], parameters: [] });
      }
    }
    return endpoints;
  } catch {
    return [];
  }
}

async function scan(baseUrl: string): Promise<ScanResult> {
  const base = hostUrl(baseUrl);
  const candidates = ['/swagger.json', '/openapi.json', '/api-docs', '/swagger/v1/swagger.json'];
  for (const c of candidates) {
    try {
      const res = await fetch(base + c);
      if (res.ok) {
        const json = await res.json();
        if (json && (json.swagger || json.openapi || json.paths)) return buildScanResult(base, json);
      }
    } catch {
      /* try next */
    }
  }
  const graphqlEndpoints = await tryGraphQLFetch(baseUrl);
  if (graphqlEndpoints.length > 0) {
    return { url: base, detectedSpec: 'graphql', endpoints: graphqlEndpoints };
  }
  return { url: base, detectedSpec: 'none', endpoints: [] };
}

function generateFromScan(input: ScanResult): Collection {
  const root: Collection = {
    id: genId(),
    name: 'Scanned Collection',
    description: input.url,
    type: 'folder',
    children: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const folders = new Map<string, Collection>();
  for (const ep of input.endpoints) {
    const tag = ep.tags?.[0] ?? 'General';
    let folder = folders.get(tag);
    if (!folder) {
      folder = { id: genId(), name: tag, type: 'folder', children: [], createdAt: Date.now(), updatedAt: Date.now() };
      folders.set(tag, folder);
      root.children!.push(folder);
    }
    const joinUrl = (base: string, path: string) => {
      if (path.startsWith('http')) return path;
      const b = base.replace(/\/$/, '');
      const p = path.startsWith('/') ? path : '/' + path;
      if (b.toLowerCase().endsWith('/graphql') && p.toLowerCase() === '/graphql') return b;
      return b + p;
    };
    const req: RequestData = {
      id: genId(),
      name: ep.summary || `${ep.method} ${ep.path}`,
      method: ep.method,
      url: joinUrl(input.url, ep.path),
      headers: [],
      params: ep.parameters ?? [],
      bodyType: 'none',
      body: '',
      auth: { type: 'none' },
    };
    folder.children!.push({ id: genId(), name: req.name, type: 'request', data: req, createdAt: Date.now(), updatedAt: Date.now() });
  }
  return root;
}

/* ----------------------------- auth / JWT ----------------------------- */

function decodeJWT(token: string): unknown {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Not a valid JWT (expected 3 parts).');
  const b64 = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/');
  const dec = (s: string) => JSON.parse(atob(b64(s)));
  const header = dec(parts[0]);
  const payload = dec(parts[1]);
  const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  return {
    header,
    payload,
    signature: parts[2],
    expired: exp ? Date.now() > exp : false,
    expiresAt: exp,
  };
}

/* ----------------------------- docs export ----------------------------- */

function flattenRequests(node: Collection, acc: RequestData[] = []): RequestData[] {
  if (node.type === 'request' && node.data) acc.push(node.data);
  node.children?.forEach((c) => flattenRequests(c, acc));
  return acc;
}

function docsMarkdown(collection: Collection, title: string): string {
  const reqs = flattenRequests(collection);
  const lines: string[] = [`# ${title}`, '', `Generated ${new Date().toISOString().slice(0, 10)}`, ''];
  for (const r of reqs) {
    lines.push(`## ${r.method} ${r.url}`, '', '```json', r.body || '{}', '```', '');
  }
  return lines.join('\n');
}

function docsHtml(collection: Collection, title: string): string {
  const reqs = flattenRequests(collection);
  const sections = reqs
    .map(
      (r) =>
        `<section><h2>${r.method} ${r.url}</h2><pre><code>${r.body.replace(/</g, '&lt;')}</code></pre></section>`
    )
    .join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title></head><body><h1>${title}</h1>${sections}</body></html>`;
}

async function pdfExportGenerate(
  collection: Collection,
  options: PdfExportOptions
): Promise<{ format: string; content: string }> {
  const title = options.title || collection.name;
  if (options.format === 'markdown') return { format: 'markdown', content: docsMarkdown(collection, title) };
  if (options.format === 'openapi-yaml') {
    const reqs = flattenRequests(collection);
    const paths: Record<string, any> = {};
    for (const r of reqs) {
      const p = paths[r.url] ?? (paths[r.url] = {});
      p[r.method.toLowerCase()] = { summary: r.name, responses: { '200': { description: 'OK' } } };
    }
    return { format: 'openapi-yaml', content: JSON.stringify({ openapi: '3.0.3', info: { title }, paths }, null, 2) };
  }
  // pdf + html -> printable HTML (real PDF needs Puppeteer, available in Electron)
  return { format: 'html', content: docsHtml(collection, title) };
}

/* ----------------------------- AI (offline heuristic) ----------------------------- */

function aiAnalyze(payload: AIAnalyzePayload): AIAnalyzeResult {
  if (payload.channel === 'error') {
    const data = payload.data as { statusCode?: number; body?: string };
    const code = data?.statusCode;
    const hint =
      code === 400
        ? 'Bad Request — verify the request body matches the expected schema and that required fields are present.'
        : code === 401
          ? 'Unauthorized — check the Authorization header / token; it may be expired or missing.'
          : code === 403
            ? 'Forbidden — the credentials are valid but lack permission for this resource.'
            : code === 404
              ? 'Not Found — confirm the URL/path and that the resource exists on the server.'
              : code === 500
                ? 'Server Error — the issue is server-side; capture the response body and share it with the API owner.'
                : code && code >= 400
                  ? 'Client/Server error — inspect the status and response body for details.'
                  : 'No obvious error detected.';
    return { suggestion: hint };
  }
  if (payload.channel === 'tests') {
    return { suggestion: 'Add assertions for status code, response time, and key JSON paths using pm.test(...).' };
  }
  return { suggestion: 'Response received. Inspect the structure and add documentation or tests as needed.' };
}

/* ----------------------------- bridge object ----------------------------- */

export function createWebBridge() {
  return {
    invoke: async (channel: string, ...args: unknown[]): Promise<any> => {
      switch (channel) {
        case 'collections:list':
          return collections();
        case 'collections:create': {
          const p = args[0] as { name: string; type: 'folder' | 'request'; description?: string; parentId?: string; data?: RequestData };
          const nodes = collections();
          const node: Collection = {
            id: genId(),
            name: p.name,
            description: p.description,
            parentId: p.parentId,
            type: p.type,
            data: p.data,
            children: p.type === 'folder' ? [] : undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          if (p.parentId) {
            const updated = updateNode(nodes, p.parentId, {});
            const parent = findNode(updated, p.parentId);
            if (parent) {
              parent.children = [...(parent.children ?? []), node];
              persistCollections(updated);
              return node;
            }
          }
          nodes.push(node);
          persistCollections(nodes);
          return node;
        }
        case 'collections:read': {
          const id = args[0] as string;
          return findNode(collections(), id);
        }
        case 'collections:update': {
          const id = args[0] as string;
          const patch = args[1] as Partial<Collection>;
          const nodes = updateNode(collections(), id, patch);
          persistCollections(nodes);
          return findNode(nodes, id);
        }
        case 'collections:delete': {
          persistCollections(removeNode(collections(), args[0] as string));
          return { success: true };
        }
        case 'collections:import': {
          const p = args[0] as { text: string; format?: string };
          const root = importCollection(p.text, p.format as any);
          const nodes = collections();
          nodes.push(root);
          persistCollections(nodes);
          return root;
        }
        case 'requests:execute':
          return executeRequest(args[0] as RequestData, (args[1] as EnvironmentVariable[]) ?? []);
        case 'requests:history':
          return readJSON<any[]>(LS_KEYS.history, []).slice(0, (args[0] as number) ?? 100);
        case 'environments:list':
          return environments();
        case 'environments:create': {
          const p = args[0] as { name: string; variables?: EnvironmentVariable[]; color?: string; description?: string };
          const list = environments();
          const env: Environment = {
            id: genId(),
            name: p.name,
            variables: (p.variables ?? []).map(v=>({ ...v, enabled: v.enabled ?? true })),
            isActive: list.length === 0,
            color: (p as any).color,
            description: (p as any).description,
            schema_version: '1.0',
            meta: { id: genId(), created: new Date().toISOString(), modified: new Date().toISOString(), source: 'native' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          list.push(env);
          writeJSON(LS_KEYS.environments, list);
          return env;
        }
        case 'environments:update': {
          const id = args[0] as string;
          const patch = args[1] as { name?: string; variables?: EnvironmentVariable[]; color?: string; description?: string };
          const list = environments().map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now(), meta: { ...(e as any).meta, modified: new Date().toISOString() } } : e));
          writeJSON(LS_KEYS.environments, list);
          return list.find((e) => e.id === id) ?? null;
        }
        case 'environments:delete': {
          writeJSON(LS_KEYS.environments, environments().filter((e) => e.id !== (args[0] as string)));
          return { success: true };
        }
        case 'environments:setActive': {
          const id = args[0] as string;
          writeJSON(LS_KEYS.environments, environments().map((e) => ({ ...e, isActive: e.id === id })));
          return environments();
        }
        case 'route-scanner:scan':
          return scan(args[0] as string);
        case 'route-scanner:generate':
          return generateFromScan(args[0] as ScanResult);
        case 'scanner:detectFramework':
        case 'scanner:scanSource':
        case 'scanner:generateCollection':
        case 'scanner:quickScan':
          throw new Error('Source scanner requires Tauri desktop (file-system access). Run `npm run dev` / `tauri dev`.');
          // Browser fallback via sourceScanner with uploaded files could be wired here:
          // return handleSourceScanner(channel, args)
        case 'seed-generator:generate':
          return generateFieldValue(args[0] as string);
        case 'seed-generator:bulk':
          return generateBulkSeed(args[0] as string);
        case 'auth:decodeJWT':
          return decodeJWT(args[0] as string);
        case 'pdf-export:generate':
          return pdfExportGenerate(args[0] as Collection, args[1] as PdfExportOptions);
        case 'mock-server:list':
          return [] as MockServer[];
        case 'mock-server:create':
        case 'mock-server:start':
        case 'mock-server:stop':
          return { success: false, note: 'Mock server requires the Electron main process.' };
        case 'environments:import': {
          const p = args[0] as { content: string; filename?: string; format?: string; encryptSecrets?: boolean };
          const parsed = parseEnvironment(p.content, p.format as any, p.filename);
          const envs = Array.isArray(parsed) ? parsed : [parsed];
          // encrypt secrets if requested
          const all = environments();
          for (const env of envs) {
            if (p.encryptSecrets !== false) {
              for (const v of env.variables) if (v.type === 'secret' && !v.value.startsWith('KEYRING_REF:')) {
                // mock keyring ref
                v.value = `KEYRING_REF:sha256:${v.id.slice(0,12)}`;
              }
            }
            all.push(env);
          }
          writeJSON(LS_KEYS.environments, all);
          return Array.isArray(parsed) ? parsed[0] : parsed;
        }
        case 'environments:export': {
          const p2 = args[0] as { envId: string; format: string; secretMode?: string };
          const env = environments().find(e=>e.id===p2.envId);
          if (!env) throw new Error('Environment not found');
          return exportEnvironment(env, p2.format as any, (p2.secretMode as any) ?? 'encrypted');
        }
        case 'collections:importRaw': {
          const p = args[0] as { content: string; filename?: string; format?: string };
          const col = importCollection(p.content, p.format as any);
          const nodes = collections();
          nodes.push(col);
          persistCollections(nodes);
          return col;
        }
        case 'collections:export': {
          const p3 = args[0] as { collectionId: string; format: string };
          const col = findNode(collections(), p3.collectionId);
          if (!col) throw new Error('Collection not found');
          return exportCollectionFn(col, p3.format as any);
        }
        case 'ai-assistant:analyze':
          return aiAnalyze(args[0] as AIAnalyzePayload);
        case 'cli:run':
          return { stdout: '', stderr: 'CLI runner is only available in the Electron main process.', code: 1 };
        default:
          // eslint-disable-next-line no-console
          console.warn(`[webBridge] unhandled channel: ${channel}`);
          return null;
      }
    },
    on: () => {
      /* event subscriptions are a no-op in browser mode */
    },
  };
}
