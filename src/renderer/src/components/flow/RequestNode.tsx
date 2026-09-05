import { memo } from 'react';
import type { FlowNode } from '@shared/types/flow';

const METHOD_LABEL: Record<string, string> = {
  GET: 'GET', POST: 'POST', PUT: 'PUT', PATCH: 'PATCH', DELETE: 'DELETE', HEAD: 'HEAD', OPTIONS: 'OPTIONS',
};

interface Props {
  node: FlowNode;
  selected: boolean;
  dimmed: boolean;
  highlighted: boolean;
  onSelect: (id: string) => void;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
}

export const RequestNode = memo(function RequestNode({ node, selected, dimmed, highlighted, onSelect, onPointerDown }: Props) {
  const method = (node.method ?? 'REQ').toUpperCase();
  const color = node.color;

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, node.id)}
      onClick={() => onSelect(node.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(node.id); } }}
      aria-label={`${method} ${node.label}`}
      className="group"
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        background: '#121215',
        border: `1px solid ${selected || highlighted ? color : '#232329'}`,
        borderRadius: 0,
        padding: '9px 11px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
        cursor: 'grab',
        opacity: dimmed ? 0.34 : 1,
        boxShadow: highlighted
          ? `0 0 0 1px ${color}44, 0 6px 20px rgba(0,0,0,0.42), 0 0 14px ${color}22`
          : selected
          ? `0 0 0 1px ${color}2e, 0 4px 16px rgba(0,0,0,0.32)`
          : '0 2px 10px rgba(0,0,0,0.22)',
        transition: 'opacity 200ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms cubic-bezier(0.16,1,0.3,1), border-color 200ms cubic-bezier(0.16,1,0.3,1), transform 200ms cubic-bezier(0.16,1,0.3,1), background 200ms',
        userSelect: 'none',
        transform: selected || highlighted ? 'translateY(-1px)' : 'translateY(0px)',
      }}
      onMouseEnter={(e) => {
        if (!selected && !highlighted) {
          (e.currentTarget as HTMLDivElement).style.borderColor = '#2E2E36';
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.28), 0 0 0 1px #2E2E36';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
          (e.currentTarget as HTMLDivElement).style.background = '#16161A';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected && !highlighted) {
          (e.currentTarget as HTMLDivElement).style.borderColor = '#232329';
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.22)';
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0px)';
          (e.currentTarget as HTMLDivElement).style.background = '#121215';
        }
      }}
    >
      {/* subtle top highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ background: selected || highlighted ? `${color}55` : 'rgba(255,255,255,0.06)' }}
      />

      {/* method badge + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span
          style={{
            background: `${color}14`,
            color,
            border: `1px solid ${color}2e`,
            padding: '1px 6px',
            borderRadius: 0,
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            letterSpacing: 0.4,
            lineHeight: '14px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            boxShadow: selected || highlighted ? `0 0 8px ${color}22` : 'none',
          }}
        >
          {METHOD_LABEL[method] ?? method}
        </span>
        <span
          style={{
            color: '#E6E8F0',
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
            letterSpacing: '-0.01em',
            lineHeight: '16px',
          }}
          title={node.label}
        >
          {node.label}
        </span>
      </div>
      <div
        style={{
          color: '#7A7F93',
          fontSize: 10.5,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          letterSpacing: '0.01em',
        }}
        title={node.url}
      >
        {node.url || '—'}
      </div>

      {/* connection dots — refined with glow */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: -4,
          top: '50%',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: selected || highlighted ? color : '#2A2A32',
          border: '1px solid #070709',
          transform: 'translateY(-50%)',
          boxShadow: selected || highlighted ? `0 0 8px ${color}88` : '0 1px 4px rgba(0,0,0,0.4)',
          transition: 'background 200ms, box-shadow 200ms',
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: -4,
          top: '50%',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: selected || highlighted ? color : '#2A2A32',
          border: '1px solid #070709',
          transform: 'translateY(-50%)',
          boxShadow: selected || highlighted ? `0 0 8px ${color}88` : '0 1px 4px rgba(0,0,0,0.4)',
          transition: 'background 200ms, box-shadow 200ms',
        }}
      />
    </div>
  );
});
