import type { FlowEdge, FlowNode } from '@shared/types/flow';

interface Props {
  edges: FlowEdge[];
  nodes: FlowNode[];
  hoveredEdgeId: string | null;
  activeEdgeId: string | null;
  onHover: (id: string | null) => void;
  impactedEdgeIds?: Set<string>;
}

function bezierPath(s: FlowNode, t: FlowNode): string {
  const sx = s.x + s.width / 2;
  const sy = s.y + s.height / 2;
  const tx = t.x + t.width / 2;
  const ty = t.y + t.height / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.hypot(dx, dy) || 1;
  const offset = Math.min(90, dist * 0.28);
  const vertical = Math.abs(dy) > Math.abs(dx);
  if (vertical) {
    const c1x = sx, c1y = sy + Math.sign(dy) * offset;
    const c2x = tx, c2y = ty - Math.sign(dy) * offset;
    return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
  } else {
    const c1x = sx + Math.sign(dx) * offset, c1y = sy;
    const c2x = tx - Math.sign(dx) * offset, c2y = ty;
    return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
  }
}



export function FlowEdges({ edges, nodes, hoveredEdgeId, activeEdgeId, onHover, impactedEdgeIds }: Props) {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <marker id="flow-arrow-data" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#4d9fff" />
        </marker>
        <marker id="flow-arrow-auth" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb224" />
        </marker>
        <marker id="flow-arrow-seq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3d3d3d" />
        </marker>
        <marker id="flow-arrow-err" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff4d4f" />
        </marker>
      </defs>

      {edges.map((e) => {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) return null;
        const d = bezierPath(s, t);
        const isActive = activeEdgeId === e.id;
        const isHovered = hoveredEdgeId === e.id;
        const isImpacted = impactedEdgeIds?.has(e.id);
        const marker =
          isImpacted ? 'url(#flow-arrow-err)' :
          e.edgeType === 'authFlow' ? 'url(#flow-arrow-auth)' :
          e.edgeType === 'sequence' ? 'url(#flow-arrow-seq)' :
          e.edgeType === 'errorFlow' ? 'url(#flow-arrow-err)' : 'url(#flow-arrow-data)';
        const strokeWidth = isImpacted ? 3 : isActive ? 3 : isHovered ? 2.6 : e.edgeType === 'sequence' ? 1.5 : 2;
        const opacity = isImpacted ? 1 : e.edgeType === 'sequence' ? 0.55 : 0.95;
        const dash = e.edgeType === 'sequence' ? '6 5' : undefined;
        const sw = isImpacted ? '#EF4444' : isActive ? '#ededed' : e.color;
        const mid = {
          x: (s.x + t.x + s.width) / 2 + (s.width / 2) - 0,
          y: (s.y + t.y) / 2 + 36,
        };
        // Adjust mid to be nearer the curve center
        const label = e.label;

        return (
          <g key={e.id} style={{ pointerEvents: 'auto' }}
            onMouseEnter={() => onHover(e.id)}
            onMouseLeave={() => onHover(null)}
          >
            {/* hit area */}
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke' }} />
            <path
              d={d}
              fill="none"
              stroke={isImpacted ? '#EF4444' : isActive ? '#ededed' : e.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
              markerEnd={marker}
              opacity={opacity}
              style={e.animated ? { strokeDasharray: e.edgeType === 'sequence' ? '6 5' : '8 6', animation: 'flow-dash 900ms linear infinite' } as any : undefined}
            />
            {label && (
              <g>
                <rect
                  x={mid.x - (label.length * 3.2 + 8) / 2}
                  y={mid.y - 9}
                  width={label.length * 6.4 + 8}
                  height={14}
                  rx={3}
                  fill="#0a0a0a"
                  stroke={isActive || isHovered ? sw : '#262626'}
                  strokeWidth={0.9}
                />
                <text
                  x={mid.x}
                  y={mid.y + 1}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="JetBrains Mono, ui-monospace, monospace"
                  fontWeight={600}
                  fill={isActive ? '#ededed' : e.color}
                >
                  {label}
                </text>
              </g>
            )}
          </g>
        );
      })}
      <style>{`@keyframes flow-dash { to { stroke-dashoffset: -28; } }`}</style>
    </svg>
  );
}
