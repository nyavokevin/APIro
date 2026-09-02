export function FlowLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-2 text-[11px] leading-none">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Legend</div>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
          <i className="inline-block h-2.5 w-5 rounded-sm" style={{ background: '#4d9fff' }} /> Data Flow
        </span>
        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
          <i className="inline-block h-2.5 w-5 rounded-sm" style={{ background: '#ffb224' }} /> Auth Flow
        </span>
        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
          <i className="inline-block h-2.5 w-5 rounded-sm border border-dashed border-[#3d3d3d] bg-transparent" style={{ borderStyle: 'dashed' }} /> Sequence
        </span>
        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
          <i className="inline-block h-2.5 w-5 rounded-sm" style={{ background: '#ff4d4f' }} /> Error
        </span>
      </div>
    </div>
  );
}
