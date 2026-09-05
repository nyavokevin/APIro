export function FlowLegend() {
  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 z-10 px-3 py-2.5"
      style={{
        background: '#0E0E10',
        border: '1px solid #232329',
        borderRadius: 0,
        boxShadow: '0 4px 16px rgba(0,0,0,0.28)',
      }}
    >
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#7A7F93', letterSpacing: '0.08em' }}>
        <span className="h-1 w-1 rounded-full" style={{ background: '#8B5CF6' }} /> Legend
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2.5 text-xs font-medium" style={{ color: '#9FA3B5' }}>
          <i className="inline-block h-1.5 w-5 shrink-0" style={{ background: '#4d9fff', boxShadow: '0 0 8px rgba(77,159,255,0.35)' }} /> Data Flow
        </span>
        <span className="flex items-center gap-2.5 text-xs font-medium" style={{ color: '#9FA3B5' }}>
          <i className="inline-block h-1.5 w-5 shrink-0" style={{ background: '#ffb224', boxShadow: '0 0 8px rgba(255,178,36,0.35)' }} /> Auth Flow
        </span>
        <span className="flex items-center gap-2.5 text-xs font-medium" style={{ color: '#9FA3B5' }}>
          <i className="inline-block h-1.5 w-5 shrink-0" style={{ background: 'transparent', border: '1px dashed #3A3A42' }} /> Sequence
        </span>
        <span className="flex items-center gap-2.5 text-xs font-medium" style={{ color: '#9FA3B5' }}>
          <i className="inline-block h-1.5 w-5 shrink-0" style={{ background: '#EF4444', boxShadow: '0 0 8px rgba(239,68,68,0.35)' }} /> Error / Impact
        </span>
      </div>
      <div className="mt-2.5 pt-2 text-[11px] leading-relaxed" style={{ borderTop: '1px solid #1E1E24', color: '#5A5E6E' }}>
        Hover edges for label
      </div>
    </div>
  );
}
