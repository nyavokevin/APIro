import type { HttpMethod } from '@shared/types/request';

interface RequestCardProps {
  method: HttpMethod;
  name: string;
  url: string;
  status?: 'active' | 'trial';
  onClick?: () => void;
}

const METHOD_STYLES: Record<HttpMethod, { color: string; bg: string }> = {
  GET: { color: '#10B981', bg: 'rgba(16,185,129,0.10)' },
  POST: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)' },
  PUT: { color: '#FBBF24', bg: 'rgba(251,191,36,0.10)' },
  DELETE: { color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
  PATCH: { color: '#A78BFA', bg: 'rgba(167,139,250,0.10)' },
  HEAD: { color: '#A78BFA', bg: 'rgba(167,139,250,0.10)' },
  OPTIONS: { color: '#FBBF24', bg: 'rgba(251,191,36,0.10)' },
  TRACE: { color: '#82AAFF', bg: 'rgba(130,170,255,0.10)' },
};

export function RequestCard({ method, name, url, status = 'active', onClick }: RequestCardProps) {
  const m = METHOD_STYLES[method] ?? METHOD_STYLES.GET;
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className="flex flex-col bg-[#121212] cursor-pointer"
      style={{ border: '1px solid #262626', borderRadius: '0px', padding: '20px' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#404040')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#262626')}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-mono font-semibold"
          style={{ fontSize: '11px', lineHeight: '14px', padding: '4px 8px', background: m.bg, color: m.color, borderRadius: '0px' }}
        >
          {method}
        </span>
        <span
          className="text-xs font-medium capitalize"
          style={{
            padding: '4px 8px',
            background: status === 'active' ? 'rgba(16,185,129,0.10)' : 'rgba(148,163,184,0.10)',
            color: status === 'active' ? '#10B981' : '#94A3B8',
            borderRadius: '0px',
          }}
        >
          {status}
        </span>
      </div>
      <div className="mt-3 text-sm font-semibold text-[#E2E8F0] truncate" style={{ fontSize: '15px', fontWeight: 600 }}>{name}</div>
      <div className="mt-1 text-xs font-mono text-[#8F909E] truncate" style={{ fontSize: '12px' }}>{url}</div>
      <div className="mt-4 flex flex-col gap-2" style={{ borderTop: '1px solid #262626', paddingTop: '16px' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: '12px', color: '#8F909E' }}>Method</span>
          <span style={{ fontSize: '12px', color: '#E2E8F0', fontWeight: 500 }}>{method}</span>
        </div>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: '12px', color: '#8F909E' }}>URL</span>
          <span className="truncate max-w-[150px] text-right" style={{ fontSize: '12px', color: '#E2E8F0' }}>{url}</span>
        </div>
      </div>
    </div>
  );
}
