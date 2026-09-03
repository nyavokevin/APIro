interface EnvironmentCardProps {
  name: string;
  variableCount: number;
  active?: boolean;
  onClick?: () => void;
}

export function EnvironmentCard({ name, variableCount, active = false, onClick }: EnvironmentCardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className="flex flex-col bg-[#121212] cursor-pointer"
      style={{
        border: active ? '1px solid #8B5CF6' : '1px solid #262626',
        borderLeft: active ? '2px solid #8B5CF6' : '1px solid #262626',
        background: active ? 'rgba(139,92,246,0.10)' : '#121212',
        borderRadius: '0px',
        padding: '20px',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.borderColor = '#404040';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.borderColor = '#262626';
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0"
          style={{ background: active ? '#8B5CF6' : '#262626', borderRadius: '9999px' }}
        />
        <span className="text-sm font-semibold text-[#E2E8F0] truncate" style={{ fontSize: '15px', fontWeight: 600 }}>{name}</span>
        {active && (
          <span
            className="ml-auto text-xs font-medium"
            style={{ padding: '4px 8px', background: 'rgba(139,92,246,0.10)', color: '#8B5CF6', borderRadius: '0px', fontSize: '11px' }}
          >
            Active
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-[#8F909E]" style={{ fontSize: '12px' }}>{variableCount} variable{variableCount === 1 ? '' : 's'}</div>
      <div className="mt-4 flex items-center justify-between" style={{ borderTop: '1px solid #262626', paddingTop: '16px' }}>
        <span style={{ fontSize: '12px', color: '#8F909E' }}>Variables</span>
        <span style={{ fontSize: '12px', color: '#E2E8F0', fontWeight: 500 }}>{variableCount}</span>
      </div>
    </div>
  );
}
