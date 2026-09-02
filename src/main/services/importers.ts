import {
  Collection,
  RequestData,
  KeyValuePair,
  AuthConfig,
  HttpMethod,
  RequestBodyType,
} from '../../shared/types/request';
import { genId } from '../../shared/lib/id';

function kv(key: string, value: string, enabled = true, description?: string): KeyValuePair {
  return { id: genId(), key, value, enabled, description };
}

function emptyAuth(): AuthConfig {
  return { type: 'none' };
}

function makeRequest(
  name: string,
  method: HttpMethod,
  url: string,
  opts: Partial<RequestData> = {}
): RequestData {
  return {
    id: genId(),
    name,
    method,
    url,
    headers: opts.headers ?? [],
    params: opts.params ?? [],
    bodyType: opts.bodyType ?? 'none',
    body: opts.body ?? '',
    auth: opts.auth ?? emptyAuth(),
    preRequestScript: opts.preRequestScript,
    testScript: opts.testScript,
  };
}

function collectionFromRequest(req: RequestData): Collection {
  const ts = Date.now();
  return {
    id: genId(),
    name: req.name || 'Request',
    type: 'request',
    data: req,
    createdAt: ts,
    updatedAt: ts,
  };
}

function makeRoot(name: string, children: Collection[]): Collection {
  const ts = Date.now();
  return {
    id: genId(),
    name,
    type: 'folder',
    children,
    createdAt: ts,
    updatedAt: ts,
  };
}

function now(): number {
  return Date.now();
}

/* ------------------------------------------------------------------ */
/* cURL                                                                */
/* ------------------------------------------------------------------ */

function tokenizeCli(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  const src = input.replace(/\\\n/g, ' ');
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
        i++;
      } else if (ch === '\\' && quote === '"') {
        cur += src[i + 1] ?? '';
        i += 2;
      } else {
        cur += ch;
        i++;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
    } else if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
      i++;
    } else if (ch === '\\') {
      cur += src[i + 1] ?? '';
      i += 2;
    } else {
      cur += ch;
      i++;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function stripDataValue(raw: string): string {
  if (raw.startsWith('@')) return '';
  return raw;
}

function guessBodyType(headers: KeyValuePair[], body: string): RequestBodyType {
  const ct = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value.toLowerCase() ?? '';
  if (ct.includes('application/json') || body.trim().startsWith('{') || body.trim().startsWith('[')) return 'json';
  if (ct.includes('application/xml') || ct.includes('text/xml') || body.trim().startsWith('<')) return 'xml';
  if (ct.includes('application/x-www-form-urlencoded')) return 'urlencoded';
  if (ct.includes('multipart/form-data')) return 'form-data';
  if (body.trim().startsWith('{') || body.trim().startsWith('[')) return 'json';
  if (body.trim().startsWith('<')) return 'xml';
  if (/^(?:\w+=[^&\n]*&?)+$/.test(body.trim())) return 'urlencoded';
  return 'text';
}

export function parseCurl(text: string): RequestData {
  const tokens = tokenizeCli(text);
  let idx = 0;
  if (tokens[idx] === 'curl') idx++;
  let method: HttpMethod = 'GET';
  let url = '';
  const headers: KeyValuePair[] = [];
  let body = '';
  let auth: AuthConfig = emptyAuth();

  while (idx < tokens.length) {
    let t = tokens[idx];
    if (t.includes('=') && (t.startsWith('--') || /^-[A-Za-z]=/.test(t))) {
      const eq = t.indexOf('=');
      tokens.splice(idx + 1, 0, t.slice(eq + 1));
      t = t.slice(0, eq);
    }
    if (t === '-X' || t === '--request') {
      method = (tokens[++idx] || 'GET').toUpperCase() as HttpMethod;
    } else if (t === '-H' || t === '--header' || t === '--url-query') {
      const h = tokens[++idx] || '';
      const ci = h.indexOf(':');
      if (ci > 0) headers.push(kv(h.slice(0, ci).trim(), h.slice(ci + 1).trim()));
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-urlencode') {
      body = stripDataValue(tokens[++idx] || '');
      if (method === 'GET') method = 'POST';
    } else if (t === '-u' || t === '--user') {
      const u = tokens[++idx] || '';
      const sep = u.indexOf(':');
      auth = {
        type: 'basic',
        basic: { username: u.slice(0, sep), password: u.slice(sep + 1) },
      };
    } else if (t === '--url') {
      url = tokens[++idx] || '';
    } else if (/^-X[A-Za-z]+$/.test(t)) {
      method = t.slice(2).toUpperCase() as HttpMethod;
    } else if (!t.startsWith('-') && !url) {
      url = t;
    }
    idx++;
  }

  const authHeader = headers.find((h) => h.key.toLowerCase() === 'authorization');
  if (authHeader) {
    const v = authHeader.value.trim();
    if (v.toLowerCase().startsWith('bearer ')) {
      auth = { type: 'bearer', bearer: { token: v.slice(7).trim() } };
    } else if (v.toLowerCase().startsWith('basic ')) {
      try {
        const decoded = Buffer.from(v.slice(6).trim(), 'base64').toString('utf8');
        const sep = decoded.indexOf(':');
        auth = { type: 'basic', basic: { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) } };
      } catch {
        /* keep existing */
      }
    }
  }

  return makeRequest('Imported from cURL', method, url, {
    headers,
    body,
    bodyType: body ? guessBodyType(headers, body) : 'none',
    auth,
  });
}

/* ------------------------------------------------------------------ */
/* OpenAPI / Swagger                                                   */
/* ------------------------------------------------------------------ */

function openApiBase(doc: any): string {
  if (doc.servers && Array.isArray(doc.servers) && doc.servers[0]?.url) {
    return doc.servers[0].url.replace(/\/$/, '');
  }
  if (doc.host) {
    const scheme = (doc.schemes && doc.schemes[0]) || 'https';
    return `${scheme}://${doc.host}${doc.basePath || ''}`.replace(/\/$/, '');
  }
  return '';
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];

function openApiGlobalAuth(doc: any): AuthConfig {
  const schemes: any = doc.components?.securitySchemes ?? doc.securityDefinitions;
  if (!schemes) return emptyAuth();
  for (const s of Object.values<any>(schemes)) {
    if (s?.type === 'http' && s.scheme === 'bearer') return { type: 'bearer', bearer: { token: '' } };
    if (s?.type === 'apiKey') {
      return {
        type: 'api-key',
        apiKey: { key: s.name ?? 'Authorization', value: '', in: s.in === 'query' ? 'query' : 'header' },
      };
    }
  }
  return emptyAuth();
}

export function parseOpenApi(doc: any): Collection {
  const base = openApiBase(doc);
  const paths: Record<string, any> = doc.paths ?? {};
  const globalAuth = openApiGlobalAuth(doc);
  const byTag = new Map<string, Collection[]>();

  for (const [path, ops] of Object.entries<any>(paths)) {
    for (const method of HTTP_METHODS) {
      const op = ops?.[method.toLowerCase()];
      if (!op) continue;
      const params: KeyValuePair[] = [];
      const headers: KeyValuePair[] = [];
      const allParams = [...(ops.parameters ?? []), ...(op.parameters ?? [])];
      for (const p of allParams) {
        if (p.in === 'query') params.push(kv(p.name, p.example ?? p.default ?? '', true, p.description));
        else if (p.in === 'header') headers.push(kv(p.name, p.example ?? p.default ?? '', true, p.description));
      }
      let bodyType: RequestBodyType = 'none';
      let body = '';
      const rb = op.requestBody?.content;
      if (rb) {
        const json = rb['application/json'];
        const xml = rb['application/xml'] ?? rb['text/xml'];
        if (json) {
          bodyType = 'json';
          body = json.example ? JSON.stringify(json.example, null, 2) : json.schema?.example ? JSON.stringify(json.schema.example, null, 2) : '';
        } else if (xml) {
          bodyType = 'xml';
          body = typeof xml.example === 'string' ? xml.example : '';
        } else if (rb['application/x-www-form-urlencoded']) {
          bodyType = 'urlencoded';
        }
      }
      const req = makeRequest(
        op.summary || op.operationId || `${method} ${path}`,
        method,
        `${base}${path}`,
        {
          headers,
          params,
          bodyType,
          body,
          auth: globalAuth,
        }
      );
      const tag = op.tags?.[0] ?? 'Endpoints';
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push(collectionFromRequest(req));
    }
  }

  const children = Array.from(byTag.entries()).map(([tag, reqs]) =>
    byTag.size === 1 ? reqs[0] : makeRoot(tag, reqs)
  );
  const roots = byTag.size === 1 ? children : children;
  return makeRoot(doc.info?.title ?? 'Imported OpenAPI', roots as Collection[]);
}

/* ------------------------------------------------------------------ */
/* Postman Collection v2.1                                             */
/* ------------------------------------------------------------------ */

function postmanAuth(auth: any): AuthConfig {
  if (!auth || !auth.type) return emptyAuth();
  const t = auth.type;
  const get = (arr: any[], key: string) => (Array.isArray(arr) ? arr.find((x) => x.key === key)?.value : undefined);
  if (t === 'bearer') return { type: 'bearer', bearer: { token: get(auth.bearer, 'token') ?? '' } };
  if (t === 'basic')
    return {
      type: 'basic',
      basic: { username: get(auth.basic, 'username') ?? '', password: get(auth.basic, 'password') ?? '' },
    };
  if (t === 'apikey')
    return {
      type: 'api-key',
      apiKey: {
        key: get(auth.apikey, 'key') ?? '',
        value: get(auth.apikey, 'value') ?? '',
        in: get(auth.apikey, 'in') === 'query' ? 'query' : 'header',
      },
    };
  if (t === 'oauth2')
    return {
      type: 'oauth2',
      oauth2: {
        tokenUrl: get(auth.oauth2, 'accessTokenUrl') ?? '',
        clientId: get(auth.oauth2, 'clientId') ?? '',
        clientSecret: get(auth.oauth2, 'clientSecret') ?? '',
        scope: get(auth.oauth2, 'scope') ?? '',
        grantType: get(auth.oauth2, 'grantType') ?? '',
      },
    };
  return emptyAuth();
}

function postmanUrl(url: any): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  if (url.raw) return url.raw;
  const host = Array.isArray(url.host) ? url.host.join('.') : url.host ?? '';
  const path = Array.isArray(url.path) ? url.path.join('/') : url.path ?? '';
  let u = `${host}${path ? `/${path}` : ''}`;
  if (url.query && Array.isArray(url.query) && url.query.length) {
    const q = url.query.map((x: any) => `${x.key}=${x.value ?? ''}`).join('&');
    u += `?${q}`;
  }
  return u;
}

function postmanHeaders(headers: any): KeyValuePair[] {
  if (!Array.isArray(headers)) return [];
  return headers
    .filter((h) => h && h.key)
    .map((h) => kv(h.key, h.value ?? '', !h.disabled, h.description));
}

function postmanBody(body: any): { bodyType: RequestBodyType; body: string } {
  if (!body || !body.mode) return { bodyType: 'none', body: '' };
  switch (body.mode) {
    case 'raw':
      return { bodyType: 'json', body: body.raw ?? '' };
    case 'urlencoded':
      return {
        bodyType: 'urlencoded',
        body: (body.urlencoded ?? []).map((x: any) => `${x.key}=${x.value ?? ''}`).join('&'),
      };
    case 'formdata':
      return {
        bodyType: 'form-data',
        body: (body.formdata ?? []).map((x: any) => `${x.key}=${x.value ?? ''}`).join('\n'),
      };
    case 'file':
      return { bodyType: 'binary', body: '' };
    default:
      return { bodyType: 'none', body: '' };
  }
}

function postmanItemToNode(item: any): Collection | null {
  if (!item) return null;
  if (Array.isArray(item.item)) {
    const children = item.item.map(postmanItemToNode).filter((x: any): x is Collection => x !== null);
    return { id: genId(), name: item.name ?? 'Folder', type: 'folder', children, createdAt: now(), updatedAt: now() };
  }
  const req = item.request;
  if (!req) return null;
  const { bodyType, body } = postmanBody(req.body);
  const data = makeRequest(
    item.name ?? 'Request',
    (req.method || 'GET').toUpperCase() as HttpMethod,
    postmanUrl(req.url),
    {
      headers: postmanHeaders(req.header),
      params: postmanHeaders(req.url?.query),
      bodyType,
      body,
      auth: postmanAuth(req.auth ?? item.auth),
    }
  );
  return collectionFromRequest(data);
}

export function parsePostman(doc: any): Collection {
  const children = (doc.item ?? [])
    .map(postmanItemToNode)
    .filter((x: any): x is Collection => x !== null);
  return makeRoot(doc.info?.name ?? 'Imported Postman Collection', children);
}

/* ------------------------------------------------------------------ */
/* Insomnia (export v4 "resources")                                    */
/* ------------------------------------------------------------------ */

export function parseInsomnia(doc: any): Collection {
  if (doc._type === 'request' || doc.url) {
    const data = makeRequest(
      doc.name ?? doc.url ?? 'Request',
      (doc.method || 'GET').toUpperCase() as HttpMethod,
      doc.url ?? '',
      { headers: postmanHeaders(doc.headers), bodyType: 'json', body: doc.body?.text ?? '' }
    );
    return makeRoot('Imported Insomnia Request', [collectionFromRequest(data)]);
  }

  const resources: any[] = Array.isArray(doc.resources) ? doc.resources : [];
  const byId = new Map<string, Collection>();
  const requests = new Map<string, Collection>();
  for (const r of resources) {
    if (r._type === 'request_group') {
      byId.set(r._id, {
        id: r._id,
        name: r.name ?? 'Folder',
        type: 'folder',
        children: [],
        createdAt: now(),
        updatedAt: now(),
      });
    } else if (r._type === 'request') {
      const data = makeRequest(
        r.name ?? r.url ?? 'Request',
        (r.method || 'GET').toUpperCase() as HttpMethod,
        r.url ?? '',
        {
          headers: postmanHeaders(r.headers),
          bodyType: r.body?.mimeType?.includes('json') ? 'json' : r.body?.text ? 'text' : 'none',
          body: r.body?.text ?? '',
        }
      );
      const node: Collection = collectionFromRequest(data);
      node.id = r._id;
      requests.set(r._id, node);
    }
  }
  for (const r of resources) {
    if (r._type === 'request' && r.parentId) {
      const parent = byId.get(r.parentId);
      if (parent) parent.children!.push(requests.get(r._id)!);
    }
  }
  const roots: Collection[] = [];
  for (const node of requests.values()) {
    const hasParent = resources.some((r) => r._type === 'request' && r._id === node.id && r.parentId && byId.has(r.parentId));
    if (!hasParent) roots.push(node);
  }
  const folders = Array.from(byId.values()).filter((f) => !resources.some((r: any) => r._type === 'request_group' && r._id === f.id && r.parentId && byId.has(r.parentId)));
  roots.push(...folders);
  return makeRoot(doc.name ?? 'Imported Insomnia', roots);
}

/* ------------------------------------------------------------------ */
/* HAR                                                                 */
/* ------------------------------------------------------------------ */

export function parseHar(doc: any): Collection {
  const entries: any[] = doc?.log?.entries ?? [];
  const children: Collection[] = entries.map((e, i) => {
    const req = e.request ?? {};
    const headers = postmanHeaders(req.headers);
    const params = postmanHeaders(req.queryString);
    const post = req.postData;
    let bodyType: RequestBodyType = 'none';
    let body = '';
    if (post?.text) {
      body = post.text;
      if ((post.mimeType || '').includes('json')) bodyType = 'json';
      else if ((post.mimeType || '').includes('xml')) bodyType = 'xml';
      else if ((post.mimeType || '').includes('form-urlencoded')) bodyType = 'urlencoded';
      else if (body.trim().startsWith('{') || body.trim().startsWith('[')) bodyType = 'json';
      else if (body.trim().startsWith('<')) bodyType = 'xml';
      else bodyType = 'text';
    }
    const data = makeRequest(
      `Entry ${i + 1}`,
      (req.method || 'GET').toUpperCase() as HttpMethod,
      req.url ?? '',
      { headers, params, bodyType, body }
    );
    return collectionFromRequest(data);
  });
  return makeRoot('Imported from HAR', children);
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export type ImportFormat = 'curl' | 'postman' | 'openapi' | 'swagger' | 'insomnia' | 'har';

function detectFormat(input: string): ImportFormat {
  const trimmed = input.trim();
  if (trimmed.toLowerCase().startsWith('curl ')) return 'curl';
  try {
    const data = JSON.parse(trimmed);
    if (data.log && Array.isArray(data.log.entries)) return 'har';
    if (Array.isArray(data.resources) || data._type === 'request' || data._type === 'workspace') return 'insomnia';
    if (data.swagger) return 'swagger';
    if (data.openapi || (data.paths && data.info)) return 'openapi';
    if (data.info && Array.isArray(data.item)) return 'postman';
    if (data.paths) return 'openapi';
  } catch {
    /* not json */
  }
  throw new Error('Could not detect import format. Pass an explicit format.');
}

export function importCollection(input: string, format?: ImportFormat): Collection {
  const fmt = (format ?? detectFormat(input)).toLowerCase() as ImportFormat;
  if (fmt === 'curl') {
    return makeRoot('Imported cURL', [collectionFromRequest(parseCurl(input))]);
  }
  const data = JSON.parse(input);
  switch (fmt) {
    case 'postman':
      return parsePostman(data);
    case 'openapi':
    case 'swagger':
      return parseOpenApi(data);
    case 'insomnia':
      return parseInsomnia(data);
    case 'har':
      return parseHar(data);
    default:
      throw new Error(`Unsupported import format: ${fmt}`);
  }
}
