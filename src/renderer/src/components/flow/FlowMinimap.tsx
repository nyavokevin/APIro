import type { FlowNode } from '@shared/types/flow';

interface Props {
  nodes: FlowNode[];
  offset: { x: number; y: number };
  scale: number;
  viewportEl: HTMLElement | null;
}

export function FlowMinimap({ nodes, offset, scale }: Props) {
  if (nodes.length === 0) return null;
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const aspect = w / h;
  const MW = 140;
  const MH = Math.round(MW / aspect);
  const clampedMH = Math.min(96, Math.max(56, MH));

  // viewport rect in minimap coords
  // world -> minimap: (world - min) * (MW/w)
  // viewport in world: viewport is centered at (-offset/scale), size = viewportPx / scale
  // approximate: just show a dot for center

  return (
    <div
      className="pointer-events-none absolute right-3 top-14 hidden rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-1.5 sm:block"
      style={{ width: MW + 12, height: clampedMH + 22 }}
      aria-hidden
    >
      <div className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Minimap</div>
      <div className="relative overflow-hidden rounded bg-[var(--bg-primary)]" style={{ width: MW, height: clampedMH }}>
        {/* nodes */}
        {nodes.map((n) => {
          const nx = ((n.x - minX) / w) * (MW - 6) + 3;
          const ny = ((n.y - minY) / h) * (clampedMH - 6) + 3;
          const nw = Math.max(4, (n.width / w) * MW * 0.85);
          const nh = Math.max(3, (n.height / h) * clampedMH * 0.85);
          return (
            <div
              key={n.id}
              style={{
                position: 'absolute',
                left: nx,
                top: ny,
                width: nw,
                height: nh,
                background: n.color,
                borderRadius: 1,
                opacity: 0.95,
              }}
            />
          );
        })}
        {/* viewport indicator */}
        <div
          style={{
            position: 'absolute',
            left: MW / 2 - 10,
            top: clampedMH / 2 - 8,
            width: 20,
            height: 16,
            border: '1px solid #ff5c00',
            borderRadius: 2,
            background: 'rgba(255,92,0,0.12)',
            // we don't have exact viewport mapping without viewport size; keep centered hint
            transform: `translate(${(offset.x / scale) * 0.02}px, ${(offset.y / scale) * 0.02}px)`,
          }}
        />
      </div>
    </div>
  );
}
