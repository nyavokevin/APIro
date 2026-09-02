import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface JsonTreeProps {
  data: unknown;
  name?: string;
  depth?: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ValueLeaf({ value }: { value: unknown }) {
  let color = 'var(--text-primary)';
  if (typeof value === 'string') color = 'var(--syntax-string)';
  else if (typeof value === 'number') color = 'var(--syntax-number)';
  else if (typeof value === 'boolean') color = 'var(--syntax-boolean)';
  else if (value === null) color = 'var(--syntax-null)';

  const display = typeof value === 'string' ? `"${value}"` : String(value);
  return <span style={{ color }}>{display}</span>;
}

export function JsonTree({ data, name, depth = 0 }: JsonTreeProps) {
  const [open, setOpen] = useState(depth < 2);

  if (Array.isArray(data) || isObject(data)) {
    const entries = Array.isArray(data)
      ? data.map((v, i) => [String(i), v] as const)
      : Object.entries(data as Record<string, unknown>);
    const bracket = Array.isArray(data) ? ['[', ']'] : ['{', '}'];

    return (
      <div style={{ paddingLeft: depth ? 14 : 0 }}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-left text-sm"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {name !== undefined && <span className="text-[var(--accent)]">{name}: </span>}
          <span className="text-[var(--text-secondary)]">
            {bracket[0]}
            {!open && `…${entries.length}`}
            {!open && bracket[1]}
          </span>
        </button>
        {open && (
          <div className="border-l border-[var(--border)] pl-2">
            {entries.map(([k, v]) => (
              <JsonTree key={k} name={Array.isArray(data) ? undefined : k} data={v} depth={depth + 1} />
            ))}
            <span className="text-sm text-[var(--text-secondary)]">{bracket[1]}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="text-sm" style={{ paddingLeft: depth ? 14 : 0 }}>
      {name !== undefined && <span className="text-[var(--accent)]">{name}: </span>}
      <ValueLeaf value={data} />
    </div>
  );
}
