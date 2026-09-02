import type { Collection, RequestData } from '@shared/types/request';
import type { FlowEdge, FlowGraph, FlowNode, FlowAnalysisOptions } from '@shared/types/flow';
import { applyLayout } from './layout';

const METHOD_COLOR: Record<string, string> = {
  GET: '#3fd68f',
  POST: '#ffb224',
  PUT: '#4d9fff',
  PATCH: '#bb9af7',
  DELETE: '#ff4d4f',
  HEAD: '#8f8f8f',
  OPTIONS: '#8f8f8f',
};

const EDGE_COLOR: Record<string, string> = {
  dataFlow: '#4d9fff',
  authFlow: '#ffb224',
  sequence: '#3d3d3d',
  dependency: '#767676',
  errorFlow: '#ff4d4f',
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48) || 'node';
}

function methodColor(method: string): string {
  return METHOD_COLOR[method?.toUpperCase()] ?? '#767676';
}

// Extracts all {{varName}} occurrences.
function extractMustaches(text: string): string[] {
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

// Extracts pm.environment.set("var", ...) and pm.variables.set etc from scripts.
function extractSetVars(script: string | undefined): string[] {
  if (!script) return [];
  const re = /pm\.(?:environment|variables|collectionVariables)\.set\(\s*["']([^"']+)["']/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(script))) out.push(m[1]);
  return out;
}

function flattenRequests(collections: Collection[]): { col: Collection; req: RequestData; path: string[] }[] {
  const out: { col: Collection; req: RequestData; path: string[] }[] = [];
  function walk(nodes: Collection[], parentPath: string[]) {
    for (const n of nodes) {
      if (n.type === 'request' && n.data) {
        out.push({ col: n, req: n.data, path: [...parentPath, n.name] });
      }
      if (n.children) walk(n.children, [...parentPath, n.name]);
    }
  }
  walk(collections, []);
  return out;
}

function requestContent(req: RequestData): string {
  const parts: string[] = [req.url ?? '', req.body ?? ''];
  for (const h of req.headers ?? []) parts.push(h.key, h.value);
  for (const p of req.params ?? []) parts.push(p.key, p.value);
  // auth fields may contain vars
  if (req.auth?.bearer?.token) parts.push(req.auth.bearer.token);
  if (req.auth?.apiKey?.value) parts.push(req.auth.apiKey.value);
  if (req.auth?.apiKey?.key) parts.push(req.auth.apiKey.key);
  return parts.join(' \n ');
}

export function analyzeFlow(
  collections: Collection[],
  opts: FlowAnalysisOptions = {}
): FlowGraph {
  const {
    layout = 'hierarchical',
    includeSequence = true,
    includeAuth = true,
    includeDataFlow = true,
  } = opts;

  const flat = flattenRequests(collections);
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const varProducers = new Map<string, string>(); // varName -> nodeId
  const nodeIdByRequestId = new Map<string, string>();

  // — PHASE 1 : nodes + detect producers
  for (const { col, req } of flat) {
    const nodeId = `req_${slug(col.name)}_${slug(req.name)}_${req.id.slice(0, 6)}`;
    nodeIdByRequestId.set(req.id, nodeId);
    nodes.push({
      id: nodeId,
      label: req.name || 'Untitled',
      nodeType: 'request',
      method: req.method ?? null,
      url: req.url ?? '',
      collectionId: col.id,
      requestId: req.id,
      x: 0,
      y: 0,
      width: 200,
      height: 72,
      color: methodColor(req.method ?? ''),
    });
    // producers from scripts
    const sets = [
      ...extractSetVars(req.preRequestScript),
      ...extractSetVars(req.testScript),
      // also pm.environment.set in body? unlikely
    ];
    for (const v of sets) {
      if (!varProducers.has(v)) varProducers.set(v, nodeId);
    }
    // Heuristic: POST /login or /auth that returns token likely produces authToken
    // If no explicit set, but body/headers produce known vars, we still infer via URL+method?
    // We keep explicit only for determinism.
  }

  // Heuristic fallback for vars where no explicit pm.environment.set was found.
  // This keeps the graph useful even when scripts aren't persisted (YAML mode) or user
  // used the {{var}} pattern without a matching set call.
  {
    const allVars = new Set<string>();
    for (const { req } of flat) for (const v of extractMustaches(requestContent(req))) allVars.add(v);
    for (const v of allVars) {
      if (varProducers.has(v)) continue;
      const authLike = /^(authToken|apiKey|accessToken|token|bearer|jwt)$/i.test(v);
      let fallback: string | undefined;
      if (authLike) {
        const cand = flat.find((f) => /login|auth|sign\s*in|token|oauth/i.test(f.req.name) || /login|auth|token|oauth/i.test(f.req.url));
        if (cand) fallback = nodeIdByRequestId.get(cand.req.id);
      } else {
        const firstConsumerIdx = flat.findIndex((f) => extractMustaches(requestContent(f.req)).includes(v));
        if (firstConsumerIdx > 0) {
          const resource = v.replace(/Id$/i, '').toLowerCase();
          if (resource.length >= 2) {
            const resourceCand = flat.slice(0, firstConsumerIdx).find((f) => f.req.name.toLowerCase().includes(resource) || f.req.url.toLowerCase().includes(resource));
            if (resourceCand) fallback = nodeIdByRequestId.get(resourceCand.req.id);
          }
          if (!fallback) fallback = nodeIdByRequestId.get(flat[Math.max(0, firstConsumerIdx - 1)].req.id);
          // Fallback to very first request if still none
          if (!fallback && flat.length > 0) fallback = nodeIdByRequestId.get(flat[0].req.id);
        } else if (firstConsumerIdx === 0 && flat.length > 1) {
          // var used in first request itself — producer is likely first request (self-loop avoided later)
          fallback = nodeIdByRequestId.get(flat[0].req.id);
        }
      }
      if (fallback) varProducers.set(v, fallback);
    }
  }

  // Build ordered list for sequence edges: group by top-level collection
  const byTopCollection = new Map<string, typeof flat>();
  for (const item of flat) {
    // find top ancestor name via walk? For now group by immediate parent traversal order.
    // Use flat order as sequence order within each top-level folder.
    const topName = item.path[0] ?? 'default';
    const arr = byTopCollection.get(topName);
    if (arr) arr.push(item);
    else byTopCollection.set(topName, [item]);
  }

  // — PHASE 2/3 : consumers → edges
  for (const { req } of flat) {
    const targetId = nodeIdByRequestId.get(req.id)!;
    const content = requestContent(req);
    const varsInContent = extractMustaches(content);

    const isAuthVar = (v: string) => /^(authToken|apiKey|accessToken|token|bearer|jwt)$/i.test(v);

    if (includeDataFlow) {
      for (const v of varsInContent) {
        if (isAuthVar(v)) continue; // auth vars are represented as authFlow, not dataFlow
        const sourceId = varProducers.get(v);
        if (sourceId && sourceId !== targetId) {
          const edgeId = `data_${sourceId}__${targetId}__${v}`;
          if (!edges.some((e) => e.id === edgeId)) {
            edges.push({
              id: edgeId,
              source: sourceId,
              target: targetId,
              edgeType: 'dataFlow',
              label: v,
              animated: true,
              color: EDGE_COLOR.dataFlow,
            });
          }
        }
      }
    }

    if (includeAuth) {
      // one auth edge per consumer (dedup by source→target)
      const authSources = new Set<string>();
      const authVars = varsInContent.filter(isAuthVar);
      for (const v of authVars) {
        const src = varProducers.get(v) ?? varProducers.get('authToken') ?? varProducers.get('token');
        if (src && src !== targetId) authSources.add(src);
      }
      if (req.auth?.type === 'bearer' && req.auth.bearer?.token?.includes('{{')) {
        for (const v of extractMustaches(req.auth.bearer.token)) {
          const src = varProducers.get(v);
          if (src && src !== targetId) authSources.add(src);
        }
      }
      for (const src of authSources) {
        // dedup: only one auth edge per pair
        if (edges.some((e) => e.edgeType === 'authFlow' && e.source === src && e.target === targetId)) continue;
        const edgeId = `auth_${src}__${targetId}`;
        edges.push({
          id: edgeId,
          source: src,
          target: targetId,
          edgeType: 'authFlow',
          label: 'auth',
          animated: false,
          color: EDGE_COLOR.authFlow,
        });
      }
    }
  }

  // — PHASE 4 : sequence edges (order within each top collection)
  if (includeSequence) {
    for (const [, group] of byTopCollection) {
      for (let i = 0; i < group.length - 1; i++) {
        const a = nodeIdByRequestId.get(group[i].req.id)!;
        const b = nodeIdByRequestId.get(group[i + 1].req.id)!;
        // Avoid duplicating if a dataFlow already connects same pair — keep both but label differently
        const edgeId = `seq_${a}__${b}`;
        if (!edges.some((e) => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: a,
            target: b,
            edgeType: 'sequence',
            label: String(i + 1),
            animated: false,
            color: EDGE_COLOR.sequence,
          });
        }
      }
    }
  }

  const graph: FlowGraph = { nodes, edges, layout };
  applyLayout(graph, layout);
  return graph;
}

// Convenience: analyze single collection by id (for Rust parity)
export function analyzeFlowForCollection(
  collections: Collection[],
  collectionId: string,
  opts?: FlowAnalysisOptions
): FlowGraph {
  function findCol(nodes: Collection[], id: string): Collection | null {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) {
        const f = findCol(n.children, id);
        if (f) return f;
      }
    }
    return null;
  }
  const root = findCol(collections, collectionId);
  if (!root) return { nodes: [], edges: [], layout: opts?.layout ?? 'hierarchical' };
  const subset = root.type === 'folder' ? (root.children ?? []) : [root];
  // Wrap subset to reuse analyzer: create a synthetic top-level so grouping works.
  const synthetic: Collection = {
    id: root.id,
    name: root.name,
    type: 'folder',
    children: subset,
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
  };
  return analyzeFlow([synthetic], opts);
}
