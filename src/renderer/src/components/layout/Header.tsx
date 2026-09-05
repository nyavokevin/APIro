import { useState, useRef, useEffect } from 'react';
import { ChevronDown, AlertTriangle, Command } from 'lucide-react';
import { useEnvironmentStore } from '../../stores/environmentStore';

interface HeaderProps {
  title?: string;
  count?: number;
  countLabel?: string;
}

export function Header({ title = 'API Library', count, countLabel }: HeaderProps) {
  return (
    <header
      className="flex shrink-0 items-center justify-between"
      style={{
        height: '64px',
        background: '#070709',
        borderBottom: '1px solid #232329',
        paddingLeft: '28px',
        paddingRight: '28px',
      }}
    >
      <div className="flex items-center gap-3">
        <h1
          className="tracking-tight"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '22px',
            lineHeight: '28px',
            fontWeight: 650,
            color: '#E6E8F0',
            letterSpacing: '-0.03em',
          }}
        >
          {title}
        </h1>
        {count !== undefined && (
          <span
            className="inline-flex items-center tabular-nums"
            style={{
              background: '#121215',
              border: '1px solid #232329',
              padding: '3px 10px',
              fontSize: '12px',
              lineHeight: '16px',
              fontWeight: 550,
              color: '#7A7F93',
              borderRadius: '9999px',
              letterSpacing: '-0.01em',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6] mr-2 animate-pulse" aria-hidden />
            {countLabel ? `${count} ${countLabel}` : `${count}`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {/* subtle hint for command palette */}
        <span className="hidden lg:inline-flex items-center gap-1.5 rounded bg-[#121215] px-2 py-1 text-[11px] font-medium text-[#7A7F93] border border-[#232329]">
          <Command size={12} /> K
        </span>
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
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < 280 && spaceAbove > spaceBelow) setDropUp(true);
    else setDropUp(false);
  }, [open]);

  const active = environments.find((e) => e.id === activeId) ?? environments[0] ?? null;
  const label = active ? active.name : 'No Environment';
  const n = (active?.name ?? '').toLowerCase().trim();
  const isProd = n.includes('prod') || n.includes('live') || n === 'production';
  const isStaging = !isProd && (n.includes('stag') || n.includes('preview'));
  const dotColor = isProd ? '#EF4444' : isStaging ? '#F59E0B' : active ? '#8B5CF6' : '#3A3A46';
  const textColor = isProd ? '#FCA5A5' : isStaging ? '#FCD34D' : active ? '#E6E8F0' : '#7A7F93';
  const borderColor = isProd ? 'rgba(239,68,68,0.40)' : isStaging ? 'rgba(245,158,11,0.35)' : '#232329';
  const bg = isProd ? 'rgba(239,68,68,0.08)' : isStaging ? 'rgba(245,158,11,0.08)' : '#121215';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 transition-all duration-200 active:scale-[0.98] hover:border-[#2E2E36]"
        style={{
          background: bg,
          color: textColor,
          border: `1px solid ${borderColor}`,
          borderRadius: '0px',
          padding: '8px 11px',
          fontSize: '13px',
          lineHeight: '20px',
          fontWeight: isProd ? 600 : 500,
          minWidth: '210px',
          width: '210px',
          justifyContent: 'space-between',
          boxShadow: isProd ? '0 0 0 3px rgba(239,68,68,0.10)' : open ? '0 0 0 3px rgba(139,92,246,0.10)' : 'none',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={isProd ? `Active environment is ${label} — scans will hit production` : isStaging ? `Active environment is ${label}` : `Active environment — ${label}`}
      >
        <span className="flex items-center gap-2 truncate">
          <span
            aria-hidden
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '9999px',
              background: dotColor,
              flexShrink: 0,
              boxShadow: isProd ? '0 0 8px rgba(239,68,68,0.55)' : active ? '0 0 6px rgba(139,92,246,0.35)' : 'none',
            }}
          />
          <span style={{ color: textColor, letterSpacing: '-0.01em' }} className="truncate">{label}</span>
          {isProd && <AlertTriangle size={12} className="shrink-0 text-[#EF4444]" aria-hidden />}
        </span>
        <ChevronDown
          size={15}
          className="shrink-0 transition-transform duration-200"
          style={{ color: isProd ? '#FCA5A5' : '#7A7F93', marginLeft: '8px', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div
          className={`absolute right-0 z-30 min-w-[268px] overflow-auto bg-[#121215] py-1.5 animate-fadeUp ${dropUp ? 'bottom-full mb-1.5' : 'mt-1.5'}`}
          style={{ border: '1px solid #232329', borderRadius: '0px', maxHeight: 'min(340px, 50vh)', boxShadow: '0 16px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)' }}
          role="listbox"
        >
          {isProd && (
            <div className="mx-2 mb-1.5 flex items-center gap-2 px-2.5 py-1.5 text-xs" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5', borderRadius: '0px' }}>
              <AlertTriangle size={12} className="shrink-0" />
              <span className="font-medium">Production active — scans will hit live API</span>
            </div>
          )}
          {environments.length === 0 && (
            <div className="px-3 py-3 text-sm text-[#7A7F93]">No environments — create one in Environments</div>
          )}
          {environments.map((env) => {
            const en = env.name.toLowerCase().trim();
            const eIsProd = en.includes('prod') || en.includes('live') || en === 'production';
            const eIsStaging = !eIsProd && (en.includes('stag') || en.includes('preview'));
            const eActiveBg = eIsProd ? 'rgba(239,68,68,0.10)' : eIsStaging ? 'rgba(245,158,11,0.10)' : 'rgba(139,92,246,0.10)';
            const eActiveBorder = eIsProd ? '#EF4444' : eIsStaging ? '#F59E0B' : '#8B5CF6';
            return (
              <button
                key={env.id}
                role="option"
                aria-selected={env.id === activeId}
                onClick={() => {
                  setActive(env.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[#19191E]"
                style={{
                  color: env.id === activeId ? '#E6E8F0' : '#9FA3B5',
                  background: env.id === activeId ? eActiveBg : 'transparent',
                  borderLeft: env.id === activeId ? `2px solid ${eActiveBorder}` : '2px solid transparent',
                  fontWeight: env.id === activeId ? 550 : 400,
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '9999px',
                    background: eIsProd ? '#EF4444' : eIsStaging ? '#F59E0B' : env.id === activeId ? '#8B5CF6' : '#2A2A32',
                    boxShadow: env.id === activeId ? '0 0 6px rgba(139,92,246,0.35)' : 'none',
                  }}
                />
                <span className="flex-1 truncate">{env.name}</span>
                {eIsProd && <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white" style={{ background: '#EF4444' }}>PROD</span>}
                {eIsStaging && !eIsProd && <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-black" style={{ background: '#F59E0B' }}>STAGING</span>}
                {env.id === activeId && !eIsProd && !eIsStaging && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" aria-hidden />}
              </button>
            );
          })}
          <div style={{ borderTop: '1px solid #232329', marginTop: '6px', paddingTop: '6px' }} className="px-2.5">
            <span className="px-1 py-1 text-xs text-[#5A5E6E] tabular-nums">{environments.length} environment(s) · press ⌘K to switch</span>
          </div>
        </div>
      )}
    </div>
  );
}
