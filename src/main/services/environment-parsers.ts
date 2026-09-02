import { genId } from '../../shared/lib/id';
import type { Environment, EnvironmentVariable, VariableType } from '../../shared/types/request';

// ---- helpers ----

function inferType(key: string, value: string): VariableType {
  const k = key.toLowerCase();
  if (k.includes('secret') || k.includes('password') || k.includes('token') || (k.includes('key') && !k.includes('monkey'))) {
    // heuristic: key contains secret/password/token/key -> secret
    // but avoid false positives for monkey-patch etc is overly cautious; keep simple
    if (value.length > 0) return 'secret';
  }
  if (value.startsWith('{{') && value.endsWith('}}')) return 'dynamic';
  if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') return 'boolean';
  if (value !== '' && !Number.isNaN(Number(value)) && /^-?\d+(\.\d+)?$/.test(value.trim())) return 'number';
  return 'string';
}

function makeVar(key: string, value: string, type?: VariableType, enabled = true, description?: string): EnvironmentVariable {
  return {
    id: genId(),
    key,
    value: String(value ?? ''),
    type: (type as VariableType) ?? inferType(key, String(value ?? '')),
    enabled,
    description,
  };
}

function nowMeta() {
  const iso = new Date().toISOString();
  return { created: iso, modified: iso };
}

// ---- 1. Postman environment ----
// { id, name, values: [{key,value,type,enabled}], _postman_variable_scope }
export function parsePostmanEnvironment(raw: string): Environment {
  const doc = JSON.parse(raw);
  const name: string = doc.name ?? 'Imported Postman Environment';
  const values: any[] = Array.isArray(doc.values) ? doc.values : [];
  const variables: EnvironmentVariable[] = values.map((v) => {
    const t: string = v.type ?? 'default';
    const mapped: VariableType = t === 'secret' ? 'secret' : v.type === 'dynamic' ? 'dynamic' : 'string';
    // if value looks like {{...}} treat as dynamic
    const val = String(v.value ?? '');
    const finalType = val.startsWith('{{') ? 'dynamic' : mapped;
    return makeVar(v.key, val, finalType, v.enabled !== false, v.description);
  });
  // postman may have id
  const id = doc.id ?? `env_${genId()}`;
  return {
    id,
    name,
    description: doc.description,
    color: undefined,
    schema_version: '1.0',
    meta: { id, ...nowMeta(), source: 'imported', imported_from: 'postman' },
    variables,
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---- 2. Insomnia v4 (export format with resources) ----
export function parseInsomniaV4Environment(raw: string): Environment {
  const doc = JSON.parse(raw);
  // find environment resource; doc may be full export with resources[]
  let envData: any = null;
  let envName = 'Insomnia Environment';
  let envColor: string | undefined;
  if (Array.isArray(doc.resources)) {
    const env = doc.resources.find((r: any) => r._type === 'environment');
    if (env) {
      envData = env.data ?? {};
      envName = env.name ?? envName;
      envColor = env.color;
    }
  } else if (doc._type === 'environment') {
    envData = doc.data ?? {};
    envName = doc.name ?? envName;
    envColor = doc.color;
  } else if (doc.data && typeof doc.data === 'object') {
    envData = doc.data;
    envName = doc.name ?? envName;
  } else {
    throw new Error('No Insomnia environment found');
  }
  const order: string[] = doc.dataPropertyOrder?.['&'] ?? Object.keys(envData);
  const id = doc._id ?? `env_${genId()}`;
  const variables = order
    .filter((k) => envData[k] !== undefined)
    .map((k) => makeVar(k, String(envData[k] ?? ''), undefined, true));
  // also include keys not in order
  for (const k of Object.keys(envData)) if (!order.includes(k)) variables.push(makeVar(k, String(envData[k])));

  return {
    id,
    name: envName,
    color: envColor,
    schema_version: '1.0',
    meta: { id, ...nowMeta(), source: 'imported', imported_from: 'insomnia' },
    variables,
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---- 3. Insomnia v5 (YAML Git Sync) ----
// type: environment.insomnia.rest/5.0 ... environment: { baseUrl: ... }
export function parseInsomniaV5Environment(raw: string): Environment {
  // raw may be YAML; try JSON first then simple YAML parse
  let doc: any;
  raw = raw.trim();
  if (raw.startsWith('{')) {
    doc = JSON.parse(raw);
  } else {
    doc = simpleYamlParse(raw);
  }
  const name: string = doc.name ?? 'Insomnia Environment';
  const color: string | undefined = doc.color ?? doc.meta?.color;
  const envObj: Record<string, any> = doc.environment ?? doc.data ?? {};
  const id = doc.meta?.id ?? doc._id ?? `env_${genId()}`;
  const variables = Object.entries(envObj).map(([k, v]) => makeVar(k, String(v ?? '')));

  return {
    id,
    name,
    color,
    description: doc.description,
    schema_version: '1.0',
    meta: { id, ...nowMeta(), source: 'imported', imported_from: 'insomnia' },
    variables,
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---- 4. Dotenv (.env) ----
export function parseDotenv(raw: string): Environment {
  const lines = raw.split(/\r?\n/);
  const vars: EnvironmentVariable[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    // handle export prefix
    const withoutExport = t.startsWith('export ') ? t.slice(7).trim() : t;
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;
    let key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    // strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // unescape \n etc? keep simple
    vars.push(makeVar(key, value));
  }
  const id = `env_${genId()}`;
  return {
    id,
    name: 'Dotenv Import',
    schema_version: '1.0',
    meta: { id, ...nowMeta(), source: 'imported', imported_from: 'dotenv' },
    variables: vars,
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---- 5. OpenAPI x-scalar-environments ----
export function parseOpenAPIEnvironments(raw: string): Environment[] {
  let doc: any;
  raw = raw.trim();
  if (raw.startsWith('{')) doc = JSON.parse(raw);
  else doc = simpleYamlParse(raw);

  const scalarEnvs: Record<string, any> = doc['x-scalar-environments'] ?? {};
  if (!scalarEnvs || Object.keys(scalarEnvs).length === 0) throw new Error('No x-scalar-environments found');

  const out: Environment[] = [];
  for (const [envKey, envDef] of Object.entries<any>(scalarEnvs)) {
    const id = `env_${genId()}`;
    const variables = (envDef.variables ?? []).map((v: any) => {
      if (typeof v === 'string') return makeVar(v, '');
      const name = v.name ?? v.key ?? 'var';
      let val = '';
      if (typeof v.value === 'string') val = v.value;
      else if (v.value && typeof v.value === 'object') val = v.value.default ?? v.value.description ?? '';
      return makeVar(name, String(val ?? ''), v.type as VariableType);
    });
    out.push({
      id,
      name: envKey.charAt(0).toUpperCase() + envKey.slice(1),
      description: envDef.description,
      color: envDef.color,
      schema_version: '1.0',
      meta: { id, ...nowMeta(), source: 'imported', imported_from: 'openapi' },
      variables,
      isActive: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return out;
}

// ---- 6. JSON Key-Value generic ----
// { "baseUrl": "https://...", "apiKey": "...", "_meta": { name: ... } }  OR  { variables: { ... } }
export function parseJsonKv(raw: string): Environment {
  const doc = JSON.parse(raw);
  let name = 'JSON Import';
  let varsObj: Record<string, any> = {};
  if (doc._meta?.name) name = doc._meta.name;
  if (doc.variables && typeof doc.variables === 'object' && !Array.isArray(doc.variables)) {
    varsObj = doc.variables;
  } else if (doc.environment && typeof doc.environment === 'object') {
    varsObj = doc.environment;
  } else {
    // flat object minus known meta keys
    varsObj = { ...doc };
    delete (varsObj as any)._meta;
  }
  const id = `env_${genId()}`;
  const variables = Object.entries(varsObj)
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => makeVar(k, String(v ?? '')));

  return {
    id,
    name,
    schema_version: '1.0',
    meta: { id, ...nowMeta(), source: 'imported', imported_from: 'json' },
    variables,
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---- 7. CSV ----
export function parseCsv(raw: string): Environment {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error('Empty CSV');
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const keyIdx = header.indexOf('key');
  const valIdx = header.indexOf('value');
  const typeIdx = header.indexOf('type');
  const enabledIdx = header.indexOf('enabled');
  const descIdx = header.indexOf('description');
  if (keyIdx === -1 || valIdx === -1) throw new Error('CSV must have key,value columns');

  const id = `env_${genId()}`;
  const variables: EnvironmentVariable[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const key = cols[keyIdx]?.trim();
    if (!key) continue;
    const value = cols[valIdx] ?? '';
    const type = (cols[typeIdx]?.trim() as VariableType) || undefined;
    const enabledRaw = cols[enabledIdx]?.trim().toLowerCase();
    const enabled = enabledRaw ? enabledRaw === 'true' || enabledRaw === '1' : true;
    const desc = cols[descIdx]?.trim() || undefined;
    variables.push(makeVar(key, value, type, enabled, desc));
  }
  return {
    id,
    name: 'CSV Import',
    schema_version: '1.0',
    meta: { id, ...nowMeta(), source: 'imported', imported_from: 'csv' },
    variables,
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' ) {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^"|"$/g, ''));
}

// ---- 8. APIForge native YAML (.env.yaml) ----
export function parseNativeYaml(raw: string): Environment {
  const doc = simpleYamlParse(raw);
  const id = doc.meta?.id ?? `env_${genId()}`;
  const variables: EnvironmentVariable[] = (doc.variables ?? []).map((v: any) =>
    makeVar(v.key, String(v.value ?? ''), v.type as VariableType, v.enabled !== false, v.description)
  );
  return {
    id,
    name: doc.name ?? 'Imported Environment',
    description: doc.description,
    color: doc.color,
    schema_version: doc.schema_version ?? '1.0',
    meta: { id, ...nowMeta(), source: 'imported', imported_from: doc.meta?.imported_from ?? 'manual' },
    variables,
    isActive: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---- dispatcher + detection ----

export type EnvImportFormat = 'postman' | 'insomnia-v4' | 'insomnia-v5' | 'dotenv' | 'openapi' | 'json' | 'csv' | 'native';

export function detectEnvFormat(input: string, filename?: string): EnvImportFormat {
  const ext = filename?.split('.').pop()?.toLowerCase();
  const trimmed = input.trim();
  if (ext === 'env' || input.includes('\n') && /^[A-Z_]+=/.test(trimmed.split('\n').find(l=>l.trim() && !l.trim().startsWith('#')) ?? '')) {
    if (/^[A-Z_0-9]+=.*$/m.test(trimmed) || trimmed.includes('DATABASE_URL')) return 'dotenv';
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const j = JSON.parse(trimmed);
      if (j.values && Array.isArray(j.values) && j._postman_variable_scope) return 'postman';
      if (j._type === 'export' && Array.isArray(j.resources)) return 'insomnia-v4';
      if (j.swagger || j.openapi) return 'openapi';
      if (j.log && j.log.entries) throw new Error('HAR not env');
      return 'json';
    } catch { /* not json */ }
  }
  if (/type:\s*environment\.insomnia\.rest/.test(trimmed) || /environment:\s*\n/.test(trimmed)) {
    // check openapi scalar vs insomnia v5: insomnia v5 has type: environment.insomnia.rest
    if (/insomnia\.rest/.test(trimmed)) return 'insomnia-v5';
    if (/x-scalar-environments/.test(trimmed)) return 'openapi';
    return 'native';
  }
  if (/x-scalar-environments/.test(trimmed)) return 'openapi';
  if (/^key,/.test(trimmed) || /value,type,enabled/.test(trimmed)) return 'csv';
  if (/schema_version/.test(trimmed) && /variables:/.test(trimmed)) return 'native';
  if (/^[A-Z_]+=/.test(trimmed)) return 'dotenv';
  return 'json';
}

export function parseEnvironment(input: string, format?: EnvImportFormat, filename?: string): Environment | Environment[] {
  const fmt = format ?? detectEnvFormat(input, filename);
  switch (fmt) {
    case 'postman': return parsePostmanEnvironment(input);
    case 'insomnia-v4': return parseInsomniaV4Environment(input);
    case 'insomnia-v5': return parseInsomniaV5Environment(input);
    case 'dotenv': return parseDotenv(input);
    case 'openapi': return parseOpenAPIEnvironments(input);
    case 'json': return parseJsonKv(input);
    case 'csv': return parseCsv(input);
    case 'native': return parseNativeYaml(input);
    default: throw new Error(`Unsupported env format: ${fmt}`);
  }
}

// very small yaml subset parser: handles only the structures we emit (name, color, description, variables list with key/value/type/enabled/description, meta)
function simpleYamlParse(raw: string): any {
  // try to use js-yaml if available (renderer's yaml dep); fallback naive
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const yaml = require('js-yaml');
    return yaml.load(raw);
  } catch { /* fall through */ }
  try {
    // @ts-ignore
    const Y = (globalThis as any).YAML ?? (globalThis as any).yaml;
    if (Y?.parse) return Y.parse(raw);
  } catch { /* naive */ }
  // naive fallback: parse only top-level scalars + variables list
  const lines = raw.split(/\r?\n/);
  const out: any = { variables: [] };
  let curVar: any = null;
  let inVars = false;
  for (const line of lines) {
    if (/^\s*variables:\s*$/.test(line)) { inVars = true; continue; }
    if (inVars) {
      const mVar = line.match(/^\s*-\s*key:\s*(.*)\s*$/);
      if (mVar) { curVar = { key: mVar[1].replace(/^"|"$/g, '') }; out.variables.push(curVar); continue; }
      const kv = line.match(/^\s+(\w+):\s*(.*)\s*$/);
      if (kv && curVar) {
        const k = kv[1]; let v = kv[2].replace(/^"|"$/g, '').trim();
        if (v === 'true') (curVar as any)[k] = true;
        else if (v === 'false') (curVar as any)[k] = false;
        else (curVar as any)[k] = v;
      }
      continue;
    }
    const m = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
    const mColor = line.match(/^color:\s*"?([^"]+)"?\s*$/);
    if (mColor) out.color = mColor[1];
  }
  return out;
}
