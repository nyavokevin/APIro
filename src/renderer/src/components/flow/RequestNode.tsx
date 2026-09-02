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
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        background: '#0a0a0a',
        border: `1px solid ${selected || highlighted ? color : '#262626'}`,
        borderRadius: 4,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
        cursor: 'grab',
        opacity: dimmed ? 0.35 : 1,
        boxShadow: highlighted ? `0 0 0 1px ${color}55` : selected ? `0 0 0 1px ${color}33` : 'none',
        transition: 'opacity 150ms, box-shadow 150ms, border-color 150ms',
        userSelect: 'none',
      }}
    >
      {/* method badge + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span
          style={{
            background: `${color}1A`,
            color,
            border: `1px solid ${color}33`,
            padding: '1px 6px',
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            letterSpacing: 0.3,
            lineHeight: '14px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {METHOD_LABEL[method] ?? method}
        </span>
        <span
          style={{
            color: '#ededed',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
            minWidth: 0,
          }}
          title={node.label}
        >
          {node.label}
        </span>
      </div>
      <div
        style={{
          color: '#8f8f8f',
          fontSize: 10.5,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={node.url}
      >
        {node.url || '—'}
      </div>

      {/* connection dots (visual only) */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: -4,
          top: '50%',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: selected ? color : '#3d3d3d',
          border: '1px solid #000',
          transform: 'translateY(-50%)',
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: -4,
          top: '50%',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: selected ? color : '#3d3d3d',
          border: '1px solid #000',
          transform: 'translateY(-50%)',
        }}
      />
    </div>
  );
});
