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
}

const statusStyles: Record<ApiCardStatus, { bg: string; color: string }> = {
  active: { bg: 'rgba(16, 185, 129, 0.10)', color: '#10B981' },
  trial: { bg: 'rgba(148, 163, 184, 0.10)', color: '#94A3B8' },
  inactive: { bg: 'rgba(148, 163, 184, 0.10)', color: '#94A3B8' },
  beta: { bg: 'rgba(139, 92, 246, 0.10)', color: '#8B5CF6' },
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
        'flex flex-col bg-[#121212] cursor-pointer select-none',
        'transition-colors duration-150 ease-out',
        className ?? '',
      ].join(' ')}
      style={{
        border: '1px solid #262626',
        borderRadius: '0px',
        padding: '20px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#404040';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#262626';
      }}
    >
      {/* Logo / icon box */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: '48px',
          height: '48px',
          background: logoColor,
          borderRadius: '0px',
          marginBottom: '12px',
          overflow: 'hidden',
        }}
      >
        {icon ? (
          <span className="flex items-center justify-center" style={{ color: isLightColor(logoColor) ? '#0A0A0A' : '#FFFFFF' }}>
            {icon}
          </span>
        ) : logoText ? (
          <span
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: isLightColor(logoColor) ? '#0A0A0A' : '#FFFFFF',
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            {logoText.slice(0, 2).toUpperCase()}
          </span>
        ) : (
          <span
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: isLightColor(logoColor) ? '#0A0A0A' : '#FFFFFF',
            }}
          >
            {title.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Title */}
      <div
        className="text-[#E2E8F0] leading-tight"
        style={{ fontSize: '15px', lineHeight: '20px', fontWeight: 600 }}
      >
        {title}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div
          className="text-[#8F909E] truncate"
          style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 400, marginTop: '4px' }}
        >
          {subtitle}
        </div>
      )}

      {/* Spacer to push footer */}
      <div className="flex-1" style={{ minHeight: '12px' }} />

      {/* Footer stats */}
      <div
        className="flex flex-col gap-3"
        style={{
          borderTop: '1px solid #262626',
          paddingTop: '16px',
          marginTop: '16px',
        }}
      >
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <span style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 400, color: '#8F909E' }}>{s.label}</span>
            <span style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 500, color: '#E2E8F0' }}>{s.value}</span>
          </div>
        ))}

        {/* Status badge row - always last if present */}
        {(status || statusLabel) && (
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 400, color: '#8F909E' }}>Status</span>
            <span
              style={{
                fontSize: '11px',
                lineHeight: '14px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '0px',
                background: badge.bg,
                color: badge.color,
                textTransform: 'capitalize',
              }}
            >
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
  // luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}
