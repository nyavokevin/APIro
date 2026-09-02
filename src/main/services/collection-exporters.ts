import type { Collection, RequestData, EnvironmentVariable } from '../../shared/types/request';

function flattenRequests(col: Collection): RequestData[] {
  const out: RequestData[] = [];
  const walk = (c: Collection) => {
    if (c.type === 'request' && c.data) out.push(c.data);
    (c.children ?? []).forEach(walk);
  };
  walk(col);
  return out;
}

// ---- Postman collection v2.1 ----
function requestToPostmanItem(r: RequestData): any {
  const headers = r.headers.filter(h=>h.enabled && h.key).map(h=>({ key: h.key, value: h.value }));
  let body: any = undefined;
  if (r.bodyType === 'json') body = { mode: 'raw', raw: r.body };
  else if (r.bodyType === 'urlencoded') body = { mode: 'urlencoded', urlencoded: r.body.split('&').filter(Boolean).map(p=>{ const [k,v]=p.split('='); return { key:k, value:v ?? ''}; }) };
  else if (r.bodyType === 'form-data') body = { mode: 'formdata', formdata: [] };
  else if (r.body) body = { mode: 'raw', raw: r.body };

  const events: any[] = [];
  if (r.preRequestScript) events.push({ listen: 'prerequest', script: { exec: r.preRequestScript.split('\n'), type: 'text/javascript' } });
  if (r.testScript || (r as any).tests) {
    const tests = (r as any).tests ?? [];
    const script = r.testScript ?? tests.map((t:any)=>`pm.test("${t.name}",()=>{${t.assert}})`).join('\n');
    if (script) events.push({ listen: 'test', script: { exec: script.split('\n'), type: 'text/javascript' } });
  }
  return {
    name: r.name,
    request: {
      method: r.method,
      header: headers,
      url: r.url,
      body,
      auth: authToPostman(r.auth),
    },
    event: events.length?events:undefined,
  };
}

function authToPostman(auth: any): any {
  if (!auth || auth.type==='none') return undefined;
  if (auth.type==='bearer') return { type:'bearer', bearer:[{key:'token', value: auth.bearer?.token ?? '', type:'string'}]};
  if (auth.type==='basic') return { type:'basic', basic:[{key:'username',value:auth.basic?.username??''},{key:'password',value:auth.basic?.password??''}]};
  if (auth.type==='api-key') return { type:'apikey', apikey:[{key:'key',value:auth.apiKey?.key??''},{key:'value',value:auth.apiKey?.value??''},{key:'in',value:auth.apiKey?.in??'header'}]};
  return { type: auth.type };
}

function collectionToPostman(col: Collection): any {
  const mapNode = (c: Collection): any => {
    if (c.type==='request' && c.data) return requestToPostmanItem(c.data);
    return { name: c.name, item: (c.children ?? []).map(mapNode) };
  };
  const items = (col.children ?? []).map(mapNode);
  // collection-level variables / auth could be stored in collection.yaml; we embed as variable
  const variable = (col as any).variables?.map((v: EnvironmentVariable)=>({ key: v.key, value: v.value })) ?? [];
  const auth = (col as any).auth ? authToPostman((col as any).auth) : undefined;
  return {
    info: { name: col.name, description: col.description ?? '', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: items,
    variable: variable.length?variable:undefined,
    auth,
  };
}

// ---- OpenAPI 3 from collection ----
function collectionToOpenApi(col: Collection): any {
  const reqs = flattenRequests(col);
  const paths: Record<string, any> = {};
  for (const r of reqs) {
    let path = '/';
    try { const u = new URL(r.url); path = u.pathname || '/'; } catch { path = r.url.split('?')[0] || '/'; }
    const p = paths[path] ?? (paths[path] = {});
    const op: any = { summary: r.name, responses: { '200': { description: 'OK' } } };
    if (r.headers.length) op.parameters = r.headers.filter(h=>h.enabled).map(h=>({ name: h.key, in:'header', schema:{type:'string'} }));
    if (r.body) op.requestBody = { content: { 'application/json': { example: tryJson(r.body) } } };
    p[r.method.toLowerCase()] = op;
  }
  return { openapi: '3.1.0', info: { title: col.name, version: '1.0', description: col.description ?? '' }, paths };
}
function tryJson(s: string){ try{return JSON.parse(s);}catch{return s;} }

// ---- HAR ----
function collectionToHar(col: Collection): any {
  const reqs = flattenRequests(col);
  return { log: { version:'1.2', creator:{ name:'APIForge', version:'1.0' }, entries: reqs.map(r=>({ request:{ method:r.method, url:r.url, headers: r.headers.filter(h=>h.enabled).map(h=>({name:h.key,value:h.value})), postData: r.body?{mimeType:'application/json',text:r.body}:undefined } })) } };
}

// ---- YAML native (collection.yaml + requests) ----
function collectionToYaml(col: Collection): string {
  const lines: string[] = [];
  lines.push(`name: ${JSON.stringify(col.name)}`);
  if (col.description) lines.push(`description: ${JSON.stringify(col.description)}`);
  lines.push(`schema_version: "1.0"`);
  lines.push(`meta:`);
  lines.push(`  id: "${col.id}"`);
  lines.push(`  created: "${new Date(col.createdAt).toISOString()}"`);
  if ((col as any).variables) {
    lines.push(`variables:`);
    for (const v of (col as any).variables as EnvironmentVariable[]) lines.push(`  - key: ${v.key}\n    value: ${JSON.stringify(v.value)}\n    type: ${v.type}`);
  }
  if ((col as any).auth) lines.push(`auth: ${JSON.stringify((col as any).auth)}`);
  return lines.join('\n') + '\n';
}

export type CollectionExportFormat = 'postman' | 'openapi' | 'har' | 'yaml' | 'curl';

export function exportCollection(col: Collection, format: CollectionExportFormat): { content: string; filename: string; mime: string } {
  switch(format){
    case 'postman': return { content: JSON.stringify(collectionToPostman(col), null, 2), filename: `${slug(col.name)}.postman_collection.json`, mime: 'application/json' };
    case 'openapi': return { content: JSON.stringify(collectionToOpenApi(col), null, 2), filename: `${slug(col.name)}.openapi.json`, mime: 'application/json' };
    case 'har': return { content: JSON.stringify(collectionToHar(col), null, 2), filename: `${slug(col.name)}.har`, mime: 'application/json' };
    case 'yaml': return { content: collectionToYaml(col), filename: `collection.yaml`, mime: 'text/yaml' };
    case 'curl': {
      const reqs = flattenRequests(col);
      const first = reqs[0];
      const curl = first ? `curl -X ${first.method} '${first.url}'` : 'curl';
      return { content: curl, filename: `${slug(col.name)}.sh`, mime: 'text/plain' };
    }
    default: throw new Error(`Unsupported collection export format: ${format}`);
  }
}

function slug(s: string){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
