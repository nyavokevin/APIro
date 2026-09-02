import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface DropdownItem {
  label: ReactNode;
  value: string;
  onSelect?: () => void;
}

export interface DropdownGroup {
  label: string;
  items: DropdownItem[];
}

interface DropdownProps {
  trigger: ReactNode;
  items?: DropdownItem[];
  /** Optional grouped sections; rendered instead of flat `items` when given. */
  groups?: DropdownGroup[];
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({ trigger, items = [], groups, align = 'left', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute z-40 mt-1 min-w-[160px] overflow-hidden rounded border border-border bg-panel-alt py-1',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
        >
          {groups
            ? groups.map((group) => (
                <div key={group.label}>
                  <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    {group.label}
                  </div>
                  {group.items.map((item, i) => (
                    <button
                      key={`${group.label}-${i}`}
                      onClick={() => {
                        item.onSelect?.();
                        setOpen(false);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-content hover:bg-panel-alt"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))
            : items.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    item.onSelect?.();
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-content hover:bg-panel-alt"
                >
                  {item.label}
                </button>
              ))}
        </div>
      )}
    </div>
  );
}
