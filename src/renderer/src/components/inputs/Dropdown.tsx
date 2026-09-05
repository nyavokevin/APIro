import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minWidth?: number;
}

export function Dropdown({ value, options, onChange, placeholder = 'Select', className, minWidth = 140 }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < 200 && spaceAbove > spaceBelow) setDropUp(true);
    else setDropUp(false);
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div ref={ref} className={['relative inline-flex', className ?? ''].join(' ')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center justify-between bg-[#121215] hover:bg-[#16161A] active:scale-[0.98] transition-all"
        style={{
          height: '40px',
          minWidth: `${minWidth}px`,
          border: open ? '1px solid #8B5CF6' : '1px solid #232329',
          borderRadius: '0px',
          padding: '0 12px 0 14px',
          fontSize: '13px',
          lineHeight: '20px',
          fontWeight: 460,
          gap: '8px',
          color: selected ? '#E6E8F0' : '#9FA3B5',
          boxShadow: open ? '0 0 0 3px rgba(139,92,246,0.10)' : 'none',
          letterSpacing: '-0.01em',
        }}
      >
        <span className="truncate" style={{ color: selected ? '#E6E8F0' : '#7A7F93' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className="shrink-0 transition-transform duration-200"
          style={{
            color: open ? '#8B5CF6' : '#7A7F93',
            marginLeft: '8px',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          className={`absolute z-20 w-full min-w-full overflow-auto bg-[#121215] py-1 animate-fadeUp ${dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} left-0`}
          style={{ border: '1px solid #232329', borderRadius: '0px', maxHeight: 'min(260px, 40vh)', boxShadow: '0 12px 28px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.04)' }}
          role="listbox"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className="flex w-full items-center px-3.5 py-2 text-left text-sm transition-colors hover:bg-[#19191E] hover:text-[#E6E8F0]"
                style={{
                  fontSize: '13px',
                  lineHeight: '20px',
                  color: isSelected ? '#8B5CF6' : '#9FA3B5',
                  background: isSelected ? 'rgba(139,92,246,0.10)' : 'transparent',
                  borderLeft: isSelected ? '2px solid #8B5CF6' : '2px solid transparent',
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            );
          })}
          {options.length === 0 && (
            <div className="px-4 py-2.5 text-sm" style={{ color: '#7A7F93' }}>No options</div>
          )}
        </div>
      )}
    </div>
  );
}
