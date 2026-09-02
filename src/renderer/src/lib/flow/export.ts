import type { FlowGraph } from '@shared/types/flow';

// Generates standalone SVG string for export
export function renderFlowSvg(graph: FlowGraph, opts: { title?: string } = {}): string {
  const nodes = graph.nodes;
  const edges = graph.edges;
  if (nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><text x="50%" y="50%" text-anchor="middle" fill="#8f8f8f" font-family="sans-serif" font-size="14">No requests to visualize — create a collection first.</text></svg>`;
  }
  const pad = 80;
  const minX = Math.min(...nodes.map((n) => n.x)) - pad;
  const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + pad;
  const minY = Math.min(...nodes.map((n) => n.y)) - pad;
  const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + pad;
  const w = maxX - minX;
  const h = maxY - minY;

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // defs: arrow markers
  const defs = `
  <defs>
    <marker id="arrow-data" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4d9fff"/></marker>
    <marker id="arrow-auth" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb224"/></marker>
    <marker id="arrow-seq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#3d3d3d"/></marker>
    <marker id="arrow-err" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ff4d4f"/></marker>
  </defs>`;

  const nodeIndex = new Map(nodes.map((n) => [n.id, n] as const));

  function edgePath(s: typeof nodes[number], t: typeof nodes[number]): string {
    const sx = s.x + s.width / 2;
    const sy = s.y + s.height / 2;
    const tx = t.x + t.width / 2;
    const ty = t.y + t.height / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    // simple bezier: control offset proportional to distance
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = Math.min(80, dist * 0.3);
    // decide side: if mostly horizontal, curve vertical; else horizontal
    const vertical = Math.abs(dy) > Math.abs(dx);
    if (vertical) {
      const c1x = sx;
      const c1y = sy + Math.sign(dy) * offset;
      const c2x = tx;
      const c2y = ty - Math.sign(dy) * offset;
      return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
    } else {
      const c1x = sx + Math.sign(dx) * offset;
      const c1y = sy;
      const c2x = tx - Math.sign(dx) * offset;
      const c2y = ty;
      return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
    }
  }

  const edgesSvg = edges.map((e) => {
    const s = nodeIndex.get(e.source);
    const t = nodeIndex.get(e.target);
    if (!s || !t) return '';
    const d = edgePath(s, t);
    const marker =
      e.edgeType === 'authFlow' ? 'url(#arrow-auth)' :
      e.edgeType === 'sequence' ? 'url(#arrow-seq)' :
      e.edgeType === 'errorFlow' ? 'url(#arrow-err)' :
      'url(#arrow-data)';
    const dash = e.edgeType === 'sequence' ? ' stroke-dasharray="6 4"' : '';
    const label = e.label ? `<text x="${(s.x + t.x + s.width) / 2}" y="${(s.y + t.y + t.height) / 2 - 6}" text-anchor="middle" font-size="10" font-family="JetBrains Mono, monospace" fill="${esc(e.color)}" paint-order="stroke" stroke="#000" stroke-width="3" stroke-linejoin="round">${esc(e.label)}</text>` : '';
    return `<path d="${d}" fill="none" stroke="${esc(e.color)}" stroke-width="${e.edgeType === 'sequence' ? 1.4 : 2}" marker-end="${marker}"${dash} opacity="0.95"/>${label}`;
  }).join('\n');

  const nodesSvg = nodes.map((n) => {
    const rx = 4;
    const border = '#262626';
    const bg = '#0a0a0a';
    const methodBg = `${n.color}1A`;
    return `
    <g transform="translate(${n.x},${n.y})">
      <rect width="${n.width}" height="${n.height}" rx="${rx}" fill="${bg}" stroke="${border}" stroke-width="1.2"/>
      <rect x="8" y="10" width="${Math.min(52, n.width - 16)}" height="16" rx="3" fill="${methodBg}"/>
      <text x="12" y="21.5" font-size="10" font-weight="700" font-family="JetBrains Mono, monospace" fill="${esc(n.color)}">${esc((n.method ?? 'REQ').toUpperCase())}</text>
      <text x="${8 + Math.min(52, n.width - 16) + 8}" y="21.5" font-size="11" font-weight="600" font-family="sans-serif" fill="#ededed">${esc(truncate(n.label, 18))}</text>
      <text x="8" y="42" font-size="10" font-family="JetBrains Mono, monospace" fill="#8f8f8f">${esc(truncate(n.url || '—', 28))}</text>
    </g>`;
  }).join('\n');

  const titleSvg = opts.title
    ? `<text x="${minX + w / 2}" y="${minY + 24}" text-anchor="middle" font-size="13" font-weight="600" font-family="sans-serif" fill="#ededed">${esc(opts.title)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}" role="img">
  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#000000"/>
  ${defs}
  ${edgesSvg}
  ${nodesSvg}
  ${titleSvg}
</svg>`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPngFromSvg(svg: string, filename: string, scale = 2): Promise<void> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  // ensure canvas is not tainted
  const svgParsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const svgEl = svgParsed.documentElement;
  const vb = svgEl.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [0, 0, 800, 600];
  const w = Number(svgEl.getAttribute('width') ?? vb[2]);
  const h = Number(svgEl.getAttribute('height') ?? vb[3]);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load SVG for PNG export'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);

  const outUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = outUrl;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
