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

  return (
    <div
      className="pointer-events-none absolute right-3 top-14 hidden sm:block z-10"
      style={{
        width: MW + 14,
        height: clampedMH + 26,
        background: '#0E0E10',
        border: '1px solid #232329',
        borderRadius: 0,
        padding: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
      }}
      aria-hidden
    >
      <div className="mb-1 flex items-center justify-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: '#5A5E6E', letterSpacing: '0.08em' }}>
        <span className="h-1 w-1 rounded-full" style={{ background: '#5A5E6E' }} /> Minimap
      </div>
      <div className="relative overflow-hidden" style={{ width: MW, height: clampedMH, background: '#070709', border: '1px solid #1E1E24' }}>
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'linear-gradient(to right, #1E1E24 1px, transparent 1px), linear-gradient(to bottom, #1E1E24 1px, transparent 1px)',
            backgroundSize: '8px 8px',
          }}
        />
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
                borderRadius: 0,
                opacity: 0.9,
                boxShadow: `0 0 6px ${n.color}55`,
                border: `1px solid ${n.color}33`,
              }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            left: MW / 2 - 10,
            top: clampedMH / 2 - 8,
            width: 20,
            height: 16,
            border: '1px solid rgba(139,92,246,0.65)',
            borderRadius: 0,
            background: 'rgba(139,92,246,0.12)',
            boxShadow: '0 0 8px rgba(139,92,246,0.22)',
            transform: `translate(${(offset.x / scale) * 0.02}px, ${(offset.y / scale) * 0.02}px)`,
          }}
        />
      </div>
    </div>
  );
}
