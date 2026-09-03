import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useEnvironmentStore } from '../../stores/environmentStore';

interface HeaderProps {
  title?: string;
  count?: number;
  countLabel?: string;
}

export function Header({ title = 'API Library', count, countLabel }: HeaderProps) {
  return (
    <header
      className="flex shrink-0 items-center justify-between bg-[#000000]"
      style={{
        height: '64px',
        borderBottom: '1px solid #262626',
        paddingLeft: '32px',
        paddingRight: '32px',
      }}
    >
      <div className="flex items-center">
        <h1
          className="text-[#E2E8F0] tracking-tight"
          style={{ fontSize: '24px', lineHeight: '32px', fontWeight: 600, marginRight: count !== undefined ? '16px' : 0 }}
        >
          {title}
        </h1>
        {count !== undefined && (
          <span
            className="inline-flex items-center"
            style={{
              background: '#121212',
              border: '1px solid #262626',
              padding: '4px 12px',
              fontSize: '12px',
              lineHeight: '16px',
              fontWeight: 500,
              color: '#8F909E',
              borderRadius: '0px',
            }}
          >
            {countLabel ? `${count} ${countLabel}` : `${count}`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <EnvironmentDropdown />
      </div>
    </header>
  );
}

function EnvironmentDropdown() {
  const environments = useEnvironmentStore((s) => s.environments);
  const activeId = useEnvironmentStore((s) => s.activeId);
  const setActive = useEnvironmentStore((s) => s.setActive);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const active = environments.find((e) => e.id === activeId) ?? environments[0] ?? null;
  const label = active ? active.name : 'No Environment';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-[#121212] text-[#8F909E] hover:bg-[#1A1A1A] hover:text-[#E2E8F0]"
        style={{
          border: '1px solid #262626',
          borderRadius: '0px',
          padding: '8px 12px',
          fontSize: '13px',
          lineHeight: '20px',
          fontWeight: 400,
          minWidth: '140px',
          justifyContent: 'space-between',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 truncate">
          <span
            aria-hidden
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '9999px',
              background: active ? '#8B5CF6' : '#262626',
              flexShrink: 0,
            }}
          />
          <span className={active ? 'text-[#E2E8F0]' : 'text-[#8F909E]'}>{label}</span>
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-[#8F909E]"
          style={{ marginLeft: '8px', transition: 'transform 150ms ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 z-30 mt-1 min-w-[180px] bg-[#121212] py-1"
          style={{ border: '1px solid #262626', borderRadius: '0px' }}
          role="listbox"
        >
          {environments.length === 0 && (
            <div className="px-3 py-2 text-sm text-[#8F909E]">No environments</div>
          )}
          {environments.map((env) => (
            <button
              key={env.id}
              role="option"
              aria-selected={env.id === activeId}
              onClick={() => {
                setActive(env.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#1A1A1A]"
              style={{
                color: env.id === activeId ? '#E2E8F0' : '#8F909E',
                background: env.id === activeId ? 'rgba(139,92,246,0.10)' : 'transparent',
                borderLeft: env.id === activeId ? '2px solid #8B5CF6' : '2px solid transparent',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '9999px',
                  background: env.id === activeId ? '#8B5CF6' : '#262626',
                }}
              />
              {env.name}
            </button>
          ))}
          <div style={{ borderTop: '1px solid #262626', marginTop: '4px', paddingTop: '4px' }} className="px-2">
            <span className="px-2 py-1 text-xs text-[#8F909E]">{environments.length} environment(s)</span>
          </div>
        </div>
      )}
    </div>
  );
}
