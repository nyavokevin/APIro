import type { CSSProperties } from 'react';

interface EnvironmentCardProps {
  name: string;
  variableCount: number;
  active?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
  color?: string;
  secretCount?: number;
}

export function EnvironmentCard({
  name,
  variableCount,
  active = false,
  onClick,
  style,
  className,
  color,
  secretCount,
}: EnvironmentCardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={[
        'group flex flex-col select-none relative overflow-hidden cursor-pointer',
        'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:-translate-y-[1px] hover:shadow-[0_8px_24px_rgba(0,0,0,0.22)]',
        'active:translate-y-[0px] active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/20 focus-visible:border-violet-500',
        'card-spotlight',
        className ?? '',
      ].join(' ')}
      style={{
        background: active ? 'rgba(139,92,246,0.10)' : '#121215',
        border: active ? '1px solid #8B5CF6' : '1px solid #232329',
        borderLeft: active ? '2px solid #8B5CF6' : '1px solid #232329',
        borderRadius: '0px',
        padding: '18px 18px 16px',
        boxShadow: active
          ? '0 0 0 1px rgba(139,92,246,0.12), 0 4px 16px rgba(0,0,0,0.22)'
          : '0 1px 2px rgba(0,0,0,0.22)',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.borderColor = '#2E2E36';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.borderColor = '#232329';
      }}
    >
      {/* top accent line */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{
          background: `linear-gradient(90deg, transparent, ${active ? '#8B5CF6' : '#9FA3B5'}28, transparent)`,
        }}
        aria-hidden
      />

      <div className="flex items-start gap-2.5">
        <span
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border"
          style={{
            background: color ?? (active ? '#8B5CF6' : '#232329'),
            borderColor: active ? 'rgba(139,92,246,0.35)' : '#2E2E36',
            boxShadow: active ? '0 0 8px rgba(139,92,246,0.45)' : 'none',
          }}
          aria-hidden
        />
        <span
          className="min-w-0 flex-1 truncate pr-2 text-[14.5px] font-semibold leading-tight"
          style={{
            fontFamily: 'var(--font-sans)',
            color: '#E6E8F0',
            letterSpacing: '-0.02em',
            lineHeight: '19px',
            fontWeight: 640,
          }}
          title={name}
        >
          {name}
        </span>
        {active ? (
          <span
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 tabular-nums"
            style={{
              padding: '3px 8px',
              background: 'rgba(139,92,246,0.10)',
              color: '#8B5CF6',
              border: '1px solid rgba(139,92,246,0.18)',
              borderRadius: '9999px',
              fontSize: '11px',
              lineHeight: '14px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: '#8B5CF6', boxShadow: '0 0 6px rgba(139,92,246,0.55)' }}
              aria-hidden
            />
            Active
          </span>
        ) : (
          <span
            className="ml-auto hidden shrink-0 items-center gap-1 sm:inline-flex"
            style={{
              padding: '2px 6px',
              background: '#0E0E10',
              color: '#7A7F93',
              border: '1px solid #232329',
              borderRadius: '9999px',
              fontSize: '10px',
              lineHeight: '14px',
              fontWeight: 500,
              letterSpacing: '0.02em',
            }}
          >
            <span className="h-1 w-1 rounded-full bg-[#7A7F93]" aria-hidden />
            idle
          </span>
        )}
      </div>

      <div
        className="mt-1.5 flex items-center gap-2 text-xs tabular-nums"
        style={{ color: '#7A7F93', fontSize: '12px', lineHeight: '16px' }}
      >
        <span className="tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {variableCount} variable{variableCount === 1 ? '' : 's'}
        </span>
        {typeof secretCount === 'number' && secretCount > 0 && (
          <>
            <span className="h-1 w-1 rounded-full bg-[#232329]" aria-hidden />
            <span className="inline-flex items-center gap-1 text-[11px] text-[#FBBF24]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FBBF24]" aria-hidden />
              {secretCount} secret{secretCount === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>

      <div
        className="mt-4 flex items-center justify-between"
        style={{ borderTop: '1px solid #1E1E24', paddingTop: '12px' }}
      >
        <span
          style={{
            fontSize: '11px',
            lineHeight: '16px',
            fontWeight: 500,
            color: '#7A7F93',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Variables
        </span>
        <span
          className="tabular-nums"
          style={{
            fontSize: '13px',
            lineHeight: '16px',
            fontWeight: 650,
            color: active ? '#8B5CF6' : '#E6E8F0',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}
        >
          {variableCount}
        </span>
      </div>
    </div>
  );
}
