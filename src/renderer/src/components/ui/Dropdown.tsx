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
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // If less than 260px below but more above, flip up. Also cap height to viewport.
    if (spaceBelow < 280 && spaceAbove > spaceBelow) setDropUp(true);
    else setDropUp(false);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute z-40 min-w-[300px] overflow-auto bg-[#121215] py-1.5',
            dropUp ? 'bottom-full mb-1.5' : 'mt-1.5',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
          style={{
            border: '1px solid #232329',
            borderRadius: '0px',
            maxHeight: 'min(340px, 52vh)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}
        >
          {groups
            ? groups.map((group) => (
                <div key={group.label} className="py-1">
                  <div
                    className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7A7F93]"
                    style={{ letterSpacing: '0.08em' }}
                  >
                    {group.label}
                  </div>
                  {group.items.map((item, i) => (
                    <button
                      key={`${group.label}-${i}`}
                      onClick={() => {
                        item.onSelect?.();
                        setOpen(false);
                      }}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm text-[#E6E8F0] transition-colors duration-200 hover:bg-[#16161A] hover:text-[#E6E8F0] active:bg-[rgba(139,92,246,0.10)]"
                      style={{ borderRadius: '0px' }}
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
                  className="block w-full px-3 py-2 text-left text-sm text-[#E6E8F0] transition-colors duration-200 hover:bg-[#16161A] active:bg-[rgba(139,92,246,0.10)]"
                  style={{ borderRadius: '0px' }}
                >
                  {item.label}
                </button>
              ))}
        </div>
      )}
    </div>
  );
}
