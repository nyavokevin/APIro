import type { FlowGraph, FlowLayoutKind } from '@shared/types/flow';

const NODE_W = 200;
const NODE_H = 72;
const GAP_X = 56;
const GAP_Y = 96;

// Public dispatcher
export function applyLayout(graph: FlowGraph, kind: FlowLayoutKind): void {
  switch (kind) {
    case 'hierarchical': layoutHierarchical(graph); break;
    case 'grid': layoutGrid(graph); break;
    case 'circular': layoutCircular(graph); break;
    case 'forceDirected': layoutForceDirected(graph); break;
    case 'manual': /* keep x/y */ break;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────
function computeHierarchyLevels(graph: FlowGraph): Map<string, number> {
  const levels = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const n of graph.nodes) {
    inDegree.set(n.id, 0);
    levels.set(n.id, 0);
  }
  for (const e of graph.edges) {
    // only consider non-sequence for hierarchy? but include all for level computation
    // Use data/auth edges as primary; sequence influences order too.
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }
  // Kahn BFS from sources
  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);

  // If graph is cyclic or no source, fallback: all 0
  if (queue.length === 0 && graph.nodes.length > 0) {
    // pick first as source
    queue.push(graph.nodes[0].id);
  }

  const visited = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const curLevel = levels.get(cur) ?? 0;
    for (const e of graph.edges) {
      if (e.source === cur) {
        const prev = levels.get(e.target) ?? 0;
        const next = Math.max(prev, curLevel + 1);
        levels.set(e.target, next);
        const d = (inDegree.get(e.target) ?? 1) - 1;
        inDegree.set(e.target, d);
        if (d <= 0) queue.push(e.target);
      }
    }
  }
  // Nodes not visited (cycles) assign max+1
  if (visited.size < graph.nodes.length) {
    const max = Math.max(...Array.from(levels.values()), 0);
    for (const n of graph.nodes) if (!visited.has(n.id)) levels.set(n.id, max + 1);
  }
  return levels;
}

// Hierarchical: sources top, sinks bottom; nodes within level spread horizontally
function layoutHierarchical(graph: FlowGraph): void {
  if (graph.nodes.length === 0) return;
  const levels = computeHierarchyLevels(graph);
  // group by level
  const byLevel = new Map<number, string[]>();
  for (const [id, lv] of levels) {
    const arr = byLevel.get(lv);
    if (arr) arr.push(id);
    else byLevel.set(lv, [id]);
  }
  const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);
  // deterministic: sort nodes within level by id
  for (const lv of sortedLevels) byLevel.get(lv)!.sort();

  // Center each level horizontally
  const maxWidth = Math.max(...Array.from(byLevel.values()).map((arr) => arr.length), 1);
  const totalW = maxWidth * (NODE_W + GAP_X);

  for (const lv of sortedLevels) {
    const ids = byLevel.get(lv)!;
    const rowW = ids.length * (NODE_W + GAP_X) - GAP_X;
    const startX = -rowW / 2;
    ids.forEach((id, idx) => {
      const node = graph.nodes.find((n) => n.id === id);
      if (!node) return;
      node.x = startX + idx * (NODE_W + GAP_X);
      node.y = lv * (NODE_H + GAP_Y);
      node.width = NODE_W;
      node.height = NODE_H;
    });
  }
  // If only one level, center at 0
  void totalW;
}

function layoutGrid(graph: FlowGraph): void {
  const n = graph.nodes.length;
  if (n === 0) return;
  const cols = Math.ceil(Math.sqrt(n));
  graph.nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    node.x = col * (NODE_W + GAP_X) - ((cols - 1) * (NODE_W + GAP_X)) / 2;
    node.y = row * (NODE_H + GAP_Y);
    node.width = NODE_W;
    node.height = NODE_H;
  });
}

function layoutCircular(graph: FlowGraph): void {
  const n = graph.nodes.length;
  if (n === 0) return;
  if (n === 1) {
    graph.nodes[0].x = 0;
    graph.nodes[0].y = 0;
    return;
  }
  const radius = Math.max(180, (n * (NODE_W + 32)) / (2 * Math.PI));
  graph.nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    node.x = Math.cos(angle) * radius;
    node.y = Math.sin(angle) * radius;
    node.width = NODE_W;
    node.height = NODE_H;
  });
}

// Force-directed: simple Fruchterman-Reingold-ish with 120 iterations
function layoutForceDirected(graph: FlowGraph): void {
  const n = graph.nodes.length;
  if (n === 0) return;
  if (n === 1) { graph.nodes[0].x = 0; graph.nodes[0].y = 0; return; }

  // init with circular seed to avoid overlap
  layoutCircular(graph);
  // jitter
  for (const node of graph.nodes) {
    node.x += (Math.random() - 0.5) * 20;
    node.y += (Math.random() - 0.5) * 20;
  }

  const area = n * 400 * 400;
  const k = Math.sqrt(area / n) * 0.6;
  const iterations = 90;
  const dt = 0.9;

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map<string, { x: number; y: number }>();
    for (const nd of graph.nodes) disp.set(nd.id, { x: 0, y: 0 });

    // repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = graph.nodes[i];
        const b = graph.nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        if (dist < 1) dist = 1;
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp.get(a.id)!.x += fx;
        disp.get(a.id)!.y += fy;
        disp.get(b.id)!.x -= fx;
        disp.get(b.id)!.y -= fy;
      }
    }
    // attraction via edges
    for (const e of graph.edges) {
      const s = graph.nodes.find((nd) => nd.id === e.source);
      const t = graph.nodes.find((nd) => nd.id === e.target);
      if (!s || !t) continue;
      let dx = s.x - t.x;
      let dy = s.y - t.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      if (dist < 1) dist = 1;
      const force = (dist * dist) / k * 0.08;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp.get(s.id)!.x -= fx;
      disp.get(s.id)!.y -= fy;
      disp.get(t.id)!.x += fx;
      disp.get(t.id)!.y += fy;
    }
    // apply + cooling
    const temp = (1 - iter / iterations) * 28 * dt;
    for (const nd of graph.nodes) {
      const d = disp.get(nd.id)!;
      const len = Math.sqrt(d.x * d.x + d.y * d.y) || 0.1;
      const limited = Math.min(len, temp);
      nd.x += (d.x / len) * limited;
      nd.y += (d.y / len) * limited;
      // keep within bounds
      nd.x = Math.max(-900, Math.min(900, nd.x));
      nd.y = Math.max(-700, Math.min(700, nd.y));
    }
  }
  // center
  const cx = graph.nodes.reduce((s, nd) => s + nd.x, 0) / n;
  const cy = graph.nodes.reduce((s, nd) => s + nd.y, 0) / n;
  for (const nd of graph.nodes) { nd.x -= cx; nd.y -= cy; }
}
