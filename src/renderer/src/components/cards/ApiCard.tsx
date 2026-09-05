import type { ReactNode } from 'react';

export type ApiCardStatus = 'active' | 'trial' | 'inactive' | 'beta';

export interface ApiCardStat {
  label: string;
  value: string;
}

export interface ApiCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  logoColor?: string;
  logoText?: string;
  status?: ApiCardStatus;
  statusLabel?: string;
  stats?: ApiCardStat[];
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const statusStyles: Record<ApiCardStatus, { bg: string; color: string; border: string }> = {
  active: { bg: 'rgba(16, 185, 129, 0.10)', color: '#10B981', border: 'rgba(16,185,129,0.18)' },
  trial: { bg: 'rgba(148, 163, 184, 0.08)', color: '#9FA3B5', border: 'rgba(148,163,184,0.14)' },
  inactive: { bg: 'rgba(148, 163, 184, 0.08)', color: '#9FA3B5', border: 'rgba(148,163,184,0.14)' },
  beta: { bg: 'rgba(139, 92, 246, 0.10)', color: '#8B5CF6', border: 'rgba(139,92,246,0.18)' },
};

export function ApiCard({
  title,
  subtitle,
  icon,
  logoColor = '#EF4444',
  logoText,
  status = 'active',
  statusLabel,
  stats = [],
  onClick,
  className,
  style,
}: ApiCardProps) {
  const badge = statusStyles[status] ?? statusStyles.active;
  const badgeText = statusLabel ?? (status === 'active' ? 'Active' : status === 'trial' ? 'Trial' : status);

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
        'group flex flex-col select-none relative overflow-hidden',
        'bg-[#121215] cursor-pointer',
        'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'hover:bg-[#16161A] hover:-translate-y-[1px] hover:border-[#2E2E36]',
        'active:translate-y-[0px] active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/20 focus-visible:border-violet-500',
        'card-spotlight',
        className ?? '',
      ].join(' ')}
      style={{
        border: '1px solid #232329',
        borderRadius: '0px',
        padding: '20px',
        // subtle tinted shadow on hover is handled via hover class; base shadow for depth
        boxShadow: '0 1px 2px rgba(0,0,0,0.22)',
        ...style,
      }}
    >
      {/* accent top line on hover */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: `linear-gradient(90deg, transparent, ${badge.color}30, transparent)` }}
        aria-hidden
      />

      {/* Logo / icon box */}
      <div
        className="flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-[1.02]"
        style={{
          width: '44px',
          height: '44px',
          background: logoColor,
          borderRadius: '0px',
          marginBottom: '14px',
          overflow: 'hidden',
          boxShadow: `0 4px 12px ${logoColor}1A, inset 0 1px 0 rgba(255,255,255,0.14)`,
          border: `1px solid ${logoColor}26`,
        }}
      >
        {icon ? (
          <span className="flex items-center justify-center" style={{ color: isLightColor(logoColor) ? '#0E0E10' : '#FFFFFF' }}>
            {icon}
          </span>
        ) : logoText ? (
          <span
            style={{
              fontSize: '15px',
              fontWeight: 750,
              color: isLightColor(logoColor) ? '#0E0E10' : '#FFFFFF',
              lineHeight: 1,
              letterSpacing: '-0.03em',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {logoText.slice(0, 2).toUpperCase()}
          </span>
        ) : (
          <span
            style={{
              fontSize: '14px',
              fontWeight: 750,
              color: isLightColor(logoColor) ? '#0E0E10' : '#FFFFFF',
              letterSpacing: '-0.02em',
            }}
          >
            {title.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Title */}
      <div
        className="leading-tight truncate"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '14.5px',
          lineHeight: '19px',
          fontWeight: 640,
          color: '#E6E8F0',
          letterSpacing: '-0.02em',
        }}
        title={title}
      >
        {title}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div
          className="truncate"
          style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 420, color: '#7A7F93', marginTop: '4px', letterSpacing: '-0.01em' }}
          title={subtitle}
        >
          {subtitle}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" style={{ minHeight: '14px' }} />

      {/* Footer stats */}
      <div
        className="flex flex-col gap-2.5"
        style={{
          borderTop: '1px solid #1E1E24',
          paddingTop: '14px',
          marginTop: '14px',
        }}
      >
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <span style={{ fontSize: '11.5px', lineHeight: '16px', fontWeight: 450, color: '#7A7F93', letterSpacing: '0.01em' }}>{s.label}</span>
            <span className="tabular-nums" style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 560, color: '#E6E8F0' }}>{s.value}</span>
          </div>
        ))}

        {(status || statusLabel) && (
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '11.5px', lineHeight: '16px', fontWeight: 450, color: '#7A7F93' }}>Status</span>
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                fontSize: '11px',
                lineHeight: '14px',
                fontWeight: 600,
                padding: '3px 7px',
                borderRadius: '9999px',
                background: badge.bg,
                color: badge.color,
                border: `1px solid ${badge.border}`,
                textTransform: 'capitalize',
                letterSpacing: '-0.01em',
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.color, boxShadow: `0 0 6px ${badge.color}55` }} aria-hidden />
              {badgeText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function isLightColor(hex: string): boolean {
  if (!hex.startsWith('#')) return false;
  const c = hex.replace('#', '');
  if (c.length !== 6) return c === 'fff' || c === 'ffffff';
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}
