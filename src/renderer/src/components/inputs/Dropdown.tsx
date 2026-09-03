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

  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div ref={ref} className={['relative inline-flex', className ?? ''].join(' ')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center justify-between bg-[#121212] text-[#8F909E] hover:bg-[#1A1A1A] hover:text-[#E2E8F0]"
        style={{
          height: '40px',
          minWidth: `${minWidth}px`,
          border: open ? '1px solid #8B5CF6' : '1px solid #262626',
          borderRadius: '0px',
          padding: '0 16px',
          fontSize: '13px',
          lineHeight: '20px',
          fontWeight: 400,
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.borderColor = '#404040';
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.borderColor = '#262626';
        }}
      >
        <span className="truncate" style={{ color: selected ? '#E2E8F0' : '#8F909E' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-[#8F909E]"
          style={{
            marginLeft: '8px',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-20 mt-1 w-full min-w-full bg-[#121212] py-1"
          style={{ border: '1px solid #262626', borderRadius: '0px' }}
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
                className="flex w-full items-center px-4 py-2 text-left text-sm hover:bg-[#1A1A1A] hover:text-[#E2E8F0]"
                style={{
                  fontSize: '13px',
                  lineHeight: '20px',
                  color: isSelected ? '#8B5CF6' : '#8F909E',
                  background: isSelected ? 'rgba(139,92,246,0.10)' : 'transparent',
                  borderLeft: isSelected ? '2px solid #8B5CF6' : '2px solid transparent',
                }}
              >
                {opt.label}
              </button>
            );
          })}
          {options.length === 0 && (
            <div className="px-4 py-2 text-sm text-[#8F909E]">No options</div>
          )}
        </div>
      )}
    </div>
  );
}
