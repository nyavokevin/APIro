import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { genId } from '@shared/lib/id';
import type {
  Collection,
  Environment,
  EnvironmentVariable,
  RequestData,
  ScanResult,
  PdfExportOptions,
  AIAnalyzePayload,
  SecretExportMode,
} from '@shared/types/request';
import { generateFieldValue, generateBulkSeed } from '../../../main/services/seed-generator';
import { importCollection } from '../../../main/services/importers';
import { exportEnvironment, type EnvExportFormat } from '../../../main/services/environment-exporters';
import { parseEnvironment, type EnvImportFormat } from '../../../main/services/environment-parsers';
import { exportCollection as exportCollectionFn } from '../../../main/services/collection-exporters';

// ---------- helpers: Node <-> Collection ----------

interface YamlPair {
  key: string;
  value: string;
  enabled: boolean;
}
interface RequestYaml {
  name: string;
  method: string;
  url: string;
  headers: YamlPair[];
  params: YamlPair[];
  bodyType: string;
  body: string;
}
type Node =
  | { kind: 'folder'; name: string; children: Node[] }
  | { kind: 'request'; name: string; request: RequestYaml };

function kvToYaml(pairs: RequestData['headers']): YamlPair[] {
  return pairs.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled }));
}
function yamlToKv(pairs: YamlPair[]): RequestData['headers'] {
  return pairs.map((p) => ({ id: genId(), key: p.key, value: p.value, enabled: p.enabled }));
}

function collectionToNode(col: Collection): Node {
  if (col.type === 'request' && col.data) {
    const d = col.data;
    return {
      kind: 'request',
      name: col.name,
      request: {
        name: col.name,
        method: d.method,
        url: d.url,
        headers: kvToYaml(d.headers),
        params: kvToYaml(d.params),
        bodyType: d.bodyType,
        body: d.body,
      },
    };
  }
  return {
    kind: 'folder',
    name: col.name,
    children: (col.children ?? []).map(collectionToNode),
  };
}

function nodeToCollection(node: Node, parentId?: string): Collection {
  if (node.kind === 'request') {
    const r = node.request;
    const data: RequestData = {
      id: genId(),
      name: r.name,
      method: (r.method as RequestData['method']) || 'GET',
      url: r.url,
      headers: yamlToKv(r.headers),
      params: yamlToKv(r.params),
      bodyType: (r.bodyType as RequestData['bodyType']) || 'none',
      body: r.body,
      auth: { type: 'none' },
      preRequestScript: '',
      testScript: '',
    };
    return {
      id: data.id,
      name: r.name,
      type: 'request',
      parentId,
      data,
      children: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
  const id = genId();
  const children = node.children.map((c) => nodeToCollection(c, id));
  return {
    id,
    name: node.name,
    type: 'folder',
    parentId,
    children,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---------- Tauri detection ----------

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  // Tauri v2 always injects __TAURI_INTERNALS__ (withGlobalTauri only controls the
  // legacy window.__TAURI__ global, which is NOT enabled in tauri.conf.json).
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
  return !!w.__TAURI_INTERNALS__ || !!w.__TAURI__;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

// ---------- Collections via YAML (authoritative) ----------

async function yamlReadTree(): Promise<Collection[]> {
  try {
    const nodes = await invokeTauri<Node[]>('yaml_read_tree', { dir: null });
    return nodes.map((n) => nodeToCollection(n));
  } catch (e) {
    console.warn('[tauri] yaml_read_tree failed, fallback empty', e);
    return [];
  }
}

async function yamlWriteAll(collections: Collection[]): Promise<void> {
  // We write via a temporary root: create a Node::Folder that wraps all,
  // but our Rust yaml_save_tree currently creates a subfolder for the root.
  // So we invoke yaml_save_tree for each top-level Node individually after clearing.
  // Simpler: use new command yaml_replace_all if available, else fallback to per-node save.
  // For now, attempt yaml_save_tree with a synthetic wrapper and handle FS layout in Rust.
  // We implement by calling yaml_save_tree for each node after cleaning workspace.
  // First, read existing to know what to delete — Rust side will overwrite.
  // Instead we call a new command `yaml_write_all` if it exists.
  try {
    // Try new bulk command
    const nodes = collections.map(collectionToNode);
    await invokeTauri('yaml_replace_all', { dir: null, nodes });
    return;
  } catch {
    // fallback: save each top-level via yaml_save_tree (creates subfolders)
    for (const col of collections) {
      const node = collectionToNode(col);
      try {
        await invokeTauri('yaml_save_tree', { dir: null, tree: node });
      } catch (e) {
        console.warn('[tauri] yaml_save_tree failed', e);
      }
    }
  }
}

// In-memory cache to make create/update/delete feel DB-like without round-trip FS list each time
let collectionsCache: Collection[] | null = null;

async function ensureCache(): Promise<Collection[]> {
  if (collectionsCache === null) collectionsCache = await yamlReadTree();
  return collectionsCache;
}

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
    if (n.id === id) return { ...n, ...patch, updatedAt: Date.now() };
    if (n.children) return { ...n, children: updateNode(n.children, id, patch) };
    return n;
  });
}
function insertNode(nodes: Collection[], parentId: string | undefined, newNode: Collection): Collection[] {
  if (!parentId) return [...nodes, newNode];
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...(n.children ?? []), newNode] };
    if (n.children) return { ...n, children: insertNode(n.children, parentId, newNode) };
    return n;
  });
}

// ---------- Environments via settings JSON ----------

async function readEnvironments(): Promise<Environment[]> {
  try {
    const raw = await invokeTauri<string | null>('settings_get', { key: 'environments' });
    return raw ? (JSON.parse(raw) as Environment[]) : [];
  } catch {
    return [];
  }
}
async function writeEnvironments(envs: Environment[]): Promise<void> {
  await invokeTauri('settings_set', { key: 'environments', value: JSON.stringify(envs) });
}

// ---------- Scan stub (frontend fetch) ----------

async function scanBackend(baseUrl: string): Promise<ScanResult> {
  const candidates = ['/swagger.json', '/openapi.json', '/api-docs', '/v3/api-docs', '/swagger/v1/swagger.json'];
  for (const c of candidates) {
    try {
      const res = await fetch(baseUrl.replace(/\/$/, '') + c);
      if (res.ok) {
        const json = await res.json();
        if (json && (json.swagger || json.openapi || json.paths)) {
          const paths: Record<string, unknown> = (json as { paths?: Record<string, unknown> }).paths ?? {};
          const endpoints: ScanResult['endpoints'] = [];
          for (const [path, ops] of Object.entries(paths as Record<string, Record<string, unknown>>)) {
            for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const) {
              const op = (ops as Record<string, unknown>)?.[method] as Record<string, unknown> | undefined;
              if (!op) continue;
              endpoints.push({
                method: method.toUpperCase() as ScanResult['endpoints'][number]['method'],
                path,
                summary: op.summary as string | undefined,
                description: op.description as string | undefined,
                tags: op.tags as string[] | undefined,
              });
            }
          }
          return { url: baseUrl, detectedSpec: (json as { swagger?: unknown }).swagger ? 'swagger' : 'openapi', endpoints, raw: json };
        }
      }
    } catch {
      /* next */
    }
  }
  return { url: baseUrl, detectedSpec: 'none', endpoints: [] };
}

// ---------- Export helpers ----------

function docsMarkdown(col: Collection, title: string): string {
  const flat: RequestData[] = [];
  const walk = (n: Collection) => {
    if (n.type === 'request' && n.data) flat.push(n.data);
    n.children?.forEach(walk);
  };
  walk(col);
  const lines = [`# ${title}`, '', `Generated ${new Date().toISOString().slice(0, 10)}`, ''];
  for (const r of flat) lines.push(`## ${r.method} ${r.url}`, '', '```json', r.body || '{}', '```', '');
  return lines.join('\n');
}
function docsHtml(col: Collection, title: string): string {
  const flat: RequestData[] = [];
  const walk = (n: Collection) => {
    if (n.type === 'request' && n.data) flat.push(n.data);
    n.children?.forEach(walk);
  };
  walk(col);
  const sections = flat.map((r) => `<section><h2>${r.method} ${r.url}</h2><pre><code>${r.body.replace(/</g, '&lt;')}</code></pre></section>`).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title></head><body><h1>${title}</h1>${sections}</body></html>`;
}

// ---------- Main invoke mapping ----------

export async function tauriInvokeMapped<T>(channel: string, args: unknown[]): Promise<T> {
  switch (channel) {
    case 'collections:list': {
      const cols = await ensureCache();
      return cols as unknown as T;
    }
    case 'collections:create': {
      const p = args[0] as { name: string; type: 'folder' | 'request'; description?: string; parentId?: string; data?: RequestData };
      const cache = await ensureCache();
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
      const updated = insertNode(cache, p.parentId, node);
      collectionsCache = updated;
      await yamlWriteAll(updated);
      return node as unknown as T;
    }
    case 'collections:read': {
      const id = args[0] as string;
      const cache = await ensureCache();
      return findNode(cache, id) as unknown as T;
    }
    case 'collections:update': {
      const id = args[0] as string;
      const patch = args[1] as Partial<Collection>;
      const cache = await ensureCache();
      const updated = updateNode(cache, id, patch);
      collectionsCache = updated;
      await yamlWriteAll(updated);
      return findNode(updated, id) as unknown as T;
    }
    case 'collections:delete': {
      const id = args[0] as string;
      const cache = await ensureCache();
      const updated = removeNode(cache, id);
      collectionsCache = updated;
      await yamlWriteAll(updated);
      return { success: true } as unknown as T;
    }
    case 'collections:import': {
      const p = args[0] as { text: string; format?: string };
      const imported = importCollection(p.text, p.format as never);
      const cache = await ensureCache();
      const updated = [...cache, imported];
      collectionsCache = updated;
      await yamlWriteAll(updated);
      return imported as unknown as T;
    }
    case 'requests:execute': {
      const req = args[0] as RequestData;
      const vars = (args[1] as EnvironmentVariable[]) ?? [];
      const headers = req.headers.map((h) => ({ key: h.key, value: h.value, enabled: h.enabled }));
      const params = req.params.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled }));
      return invokeTauri<T>('requests_execute', {
        request: {
          method: req.method,
          url: req.url,
          headers,
          params,
          bodyType: req.bodyType,
          body: req.body,
          timeoutMs: 30000,
          followRedirects: true,
        },
        variables: vars.map((v) => ({ key: v.key, value: v.value })),
      });
    }
    case 'requests:history': {
      const limit = (args[0] as number) ?? 100;
      return invokeTauri<T>('requests_history', { limit });
    }
    case 'environments:list':
      return (await readEnvironments()) as unknown as T;
    case 'environments:create': {
      const p = args[0] as { name: string; variables?: EnvironmentVariable[] };
      const list = await readEnvironments();
      const env: Environment = {
        id: genId(),
        name: p.name,
        variables: p.variables ?? [],
        isActive: list.length === 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const updated = [...list, env];
      await writeEnvironments(updated);
      return env as unknown as T;
    }
    case 'environments:update': {
      const id = args[0] as string;
      const patch = args[1] as { name?: string; variables?: EnvironmentVariable[] };
      const list = await readEnvironments();
      const updated = list.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e));
      await writeEnvironments(updated);
      return (updated.find((e) => e.id === id) ?? null) as unknown as T;
    }
    case 'environments:delete': {
      const id = args[0] as string;
      const list = await readEnvironments();
      await writeEnvironments(list.filter((e) => e.id !== id));
      return { success: true } as unknown as T;
    }
    case 'environments:setActive': {
      const id = args[0] as string;
      const list = await readEnvironments();
      const updated = list.map((e) => ({ ...e, isActive: e.id === id }));
      await writeEnvironments(updated);
      return updated as unknown as T;
    }
    case 'scanner:detectFramework': {
      const projectPath = args[0] as string;
      // Try Tauri Rust
      try {
        return await invokeTauri<T>('scanner_detect_framework', { projectPath });
      } catch {
        // Fallback: browser — cannot access filesystem, return guidance
        throw new Error('Source scan requires Tauri (desktop) build. Pick a folder via the desktop app.');
      }
    }
    case 'scanner:scanSource': {
      const projectPath = args[0] as string;
      const options = (args[1] as Record<string, unknown>) ?? {};
      try {
        return await invokeTauri<T>('scanner_scan_routes', { projectPath, options });
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : String(e));
      }
    }
    case 'scanner:generateCollection': {
      const scanResult = args[0] as unknown;
      const baseUrl = args[1] as string;
      const apiVersion = args[2] as string | null | undefined;
      const outputPath = args[3] as string | null | undefined;
      const collectionName = args[4] as string | null | undefined;
      const res = await invokeTauri<T>('scanner_generate_collection', { scanResult, baseUrl, apiVersion: apiVersion ?? null, outputPath: outputPath ?? null, collectionName: collectionName ?? null });
      collectionsCache = null;
      return res;
    }
    case 'scanner:quickScan': {
      const projectPath = args[0] as string;
      const baseUrl = args[1] as string;
      const collectionName = args[2] as string | null | undefined;
      const res = await invokeTauri<T>('scanner_quick_scan', { projectPath, baseUrl, collectionName: collectionName ?? null });
      collectionsCache = null;
      return res;
    }
    case 'route-scanner:scan':
      return (await scanBackend(args[0] as string)) as unknown as T;
    case 'route-scanner:generate': {
      const input = args[0] as ScanResult;
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
        const req: RequestData = {
          id: genId(),
          name: ep.summary || `${ep.method} ${ep.path}`,
          method: ep.method,
          url: ep.path.startsWith('http') ? ep.path : `${input.url}${ep.path}`,
          headers: [],
          params: ep.parameters ?? [],
          bodyType: 'none',
          body: '',
          auth: { type: 'none' },
        };
        folder.children!.push({ id: genId(), name: req.name, type: 'request', data: req, createdAt: Date.now(), updatedAt: Date.now() });
      }
      return root as unknown as T;
    }
    case 'seed-generator:generate':
      return generateFieldValue(args[0] as string) as unknown as T;
    case 'seed-generator:bulk':
      return generateBulkSeed(args[0] as string) as unknown as T;
    case 'auth:decodeJWT': {
      const token = args[0] as string;
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Not a valid JWT');
      const b64 = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/');
      const dec = (s: string) => JSON.parse(atob(b64(s)));
      return { header: dec(parts[0]), payload: dec(parts[1]), signature: parts[2] } as unknown as T;
    }
    case 'pdf-export:generate': {
      const col = args[0] as Collection;
      const opts = args[1] as PdfExportOptions;
      const title = opts.title || col.name;
      if (opts.format === 'markdown') return { format: 'markdown', content: docsMarkdown(col, title) } as unknown as T;
      if (opts.format === 'openapi-yaml') {
        const flat: RequestData[] = [];
        const walk = (n: Collection) => {
          if (n.type === 'request' && n.data) flat.push(n.data);
          n.children?.forEach(walk);
        };
        walk(col);
        const paths: Record<string, unknown> = {};
        for (const r of flat) {
          const p = (paths[r.url] ??= {}) as Record<string, unknown>;
          (p as Record<string, unknown>)[r.method.toLowerCase()] = { summary: r.name, responses: { '200': { description: 'OK' } } };
        }
        return { format: 'openapi-yaml', content: JSON.stringify({ openapi: '3.0.3', info: { title }, paths }, null, 2) } as unknown as T;
      }
      return { format: 'html', content: docsHtml(col, title) } as unknown as T;
    }
    case 'environments:import': {
      const p = args[0] as { content: string; filename?: string; format?: string; encryptSecrets?: boolean };
      const parsed = parseEnvironment(p.content, p.format as EnvImportFormat, p.filename);
      const envs = Array.isArray(parsed) ? parsed : [parsed];
      const list = await readEnvironments();
      for (const env of envs) {
        if (p.encryptSecrets !== false) {
          for (const v of env.variables) {
            if (v.type === 'secret' && !v.value.startsWith('KEYRING_REF:')) {
              // mock keyring ref (same behaviour as webBridge fallback)
              v.value = `KEYRING_REF:sha256:${v.id.slice(0, 12)}`;
            }
          }
        }
        list.push(env);
      }
      await writeEnvironments(list);
      return (Array.isArray(parsed) ? parsed[0] : parsed) as unknown as T;
    }
    case 'environments:export': {
      const p = args[0] as { envId: string; format: string; secretMode?: string };
      const env = (await readEnvironments()).find((e) => e.id === p.envId);
      if (!env) throw new Error('Environment not found');
      return exportEnvironment(env, p.format as EnvExportFormat, (p.secretMode as SecretExportMode) ?? 'encrypted') as unknown as T;
    }
    case 'collections:importRaw': {
      const p = args[0] as { content: string; filename?: string; format?: string };
      const col = importCollection(p.content, p.format as never);
      const tree = await ensureCache();
      tree.push(col);
      await yamlWriteAll(tree);
      return col as unknown as T;
    }
    case 'collections:export': {
      const p = args[0] as { collectionId: string; format: string };
      const col = findNode(await ensureCache(), p.collectionId);
      if (!col) throw new Error('Collection not found');
      return exportCollectionFn(col, p.format as never) as unknown as T;
    }
    case 'mock-server:list':
      try { return await invokeTauri<T>('mock_list', {}); } catch { return [] as unknown as T; }
    case 'mock-server:create': {
      const payload = args[0] as { name: string; port: number; routes?: import('@shared/types/request').MockRoute[]; mode?: string; targetUrl?: string | null; stateEnabled?: boolean; mocksDir?: string | null; graphqlEnabled?: boolean };
      const info = {
        id: (payload as any).id ?? genId(),
        name: payload.name,
        port: payload.port,
        running: false,
        routes: payload.routes ?? [],
        mode: payload.mode ?? 'mock',
        targetUrl: payload.targetUrl ?? null,
        stateEnabled: payload.stateEnabled ?? false,
        mocksDir: payload.mocksDir ?? null,
        latencyMs: 0,
        graphqlEnabled: payload.graphqlEnabled ?? false,
      };
      try { return await invokeTauri<T>('mock_create', { info }); } catch { return { success: false } as unknown as T; }
    }
    case 'mock-server:start': {
      const id = args[0] as string;
      try {
        await invokeTauri('mock_start', { info: { id, name: id, port: 0, running: true, routes: [] } });
        // Try to get real server info if available
        try {
          const list = await invokeTauri<import('@shared/types/request').MockServer[]>('mock_list', {});
          const found = list.find(s => s.id === id);
          if (found) return found as unknown as T;
        } catch {}
        return { id, running: true } as unknown as T;
      } catch (e) { throw e; }
    }
    case 'mock-server:stop': {
      const id = args[0] as string;
      try { await invokeTauri('mock_stop', { id }); } catch {}
      return { id, running: false } as unknown as T;
    }
    // Mock v2
    case 'mock:list':
      return await invokeTauri<T>('mock_list', {});
    case 'mock:create':
      return await invokeTauri<T>('mock_create', { info: args[0] });
    case 'mock:update':
      return await invokeTauri<T>('mock_update', { info: args[0] });
    case 'mock:delete':
      return await invokeTauri<T>('mock_delete', { id: args[0] });
    case 'mock:clearHits':
      return await invokeTauri<T>('mock_clear_hits', { id: args[0] });
    case 'mock:exportHits':
      return await invokeTauri<T>('mock_export_hits', { id: args[0] });
    case 'mock:stateSnapshot':
      return await invokeTauri<T>('mock_state_snapshot', { id: args[0] });
    case 'mock:stateSet':
      return await invokeTauri<T>('mock_state_set', { id: args[0], key: args[1], value: args[2] ?? null });
    case 'mock:stateClear':
      return await invokeTauri<T>('mock_state_clear', { id: args[0] });
    case 'mock:listRoutes':
      return await invokeTauri<T>('mock_list_routes', { id: args[0] });
    case 'mock:createRoute':
      return await invokeTauri<T>('mock_create_route', { id: args[0], route: args[1] });
    case 'mock:updateRoute':
      return await invokeTauri<T>('mock_update_route', { id: args[0], route: args[1] });
    case 'mock:deleteRoute':
      return await invokeTauri<T>('mock_delete_route', { id: args[0], routeId: args[1] });
    case 'mock:generateFromOpenapi':
      return await invokeTauri<T>('mock_generate_from_openapi', { spec: args[0], baseUrl: args[1] ?? null, generateVariants: args[2] ?? null, outputDir: args[3] ?? null });
    case 'mock:diffSpecs':
      return await invokeTauri<T>('mock_diff_specs', { oldSpec: args[0], newSpec: args[1] });
    case 'mock:mcpListTools':
      return await invokeTauri<T>('mock_mcp_list_tools', {});
    case 'mock:mcpCall':
      return await invokeTauri<T>('mock_mcp_call', { tool: args[0], arguments: args[1] });
    case 'workspace:info':
      return invokeTauri<T>('workspace_info', {});
    case 'git:status':
      return invokeTauri<T>('git_status', { dir: args[0] as string });
    case 'git:diff': {
      const dir = args[0] as string;
      const path = args[1] as string | undefined;
      return invokeTauri<T>('git_diff', { dir, path: path ?? null });
    }
    case 'ai-assistant:analyze': {
      const payload = args[0] as AIAnalyzePayload;
      if (payload.channel === 'error') {
        const code = (payload.data as { statusCode?: number })?.statusCode;
        const hint =
          code === 400 ? 'Bad Request — verify body schema.' :
          code === 401 ? 'Unauthorized — check token.' :
          code === 403 ? 'Forbidden — lacking permission.' :
          code === 404 ? 'Not Found — verify URL.' :
          code === 500 ? 'Server Error — server-side.' :
          'Inspect status and body.';
        return { suggestion: hint } as unknown as T;
      }
      return { suggestion: 'Analyze locally.' } as unknown as T;
    }
    default:
      console.warn(`[tauri] unhandled channel ${channel}`);
      return null as unknown as T;
  }
}
