import { useMemo } from 'react';
import { CheckCircle2, Plus, Minus, Pencil } from 'lucide-react';
import { structuralDiff } from '../../lib/testExecutor';

interface ResponseDiffProps {
  baseline: unknown;
  current: unknown;
}

export function ResponseDiff({ baseline, current }: ResponseDiffProps) {
  const diffs = useMemo(() => structuralDiff(baseline, current), [baseline, current]);
  if (diffs.length === 0)
    return (
      <div className="flex items-center gap-2 bg-[#121215] px-3 py-3 text-xs font-medium text-[#10B981] animate-fadeUp" style={{ border: '1px solid rgba(16,185,129,0.22)' }}>
        <span className="flex h-6 w-6 items-center justify-center bg-[rgba(16,185,129,0.14)]" style={{ border: '1px solid rgba(16,185,129,0.22)' }}>
          <CheckCircle2 size={13} />
        </span>
        No differences — identical
      </div>
    );
  return (
    <div className="overflow-hidden bg-[#121215] animate-fadeUp" style={{ border: '1px solid #232329' }}>
      <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ background: '#0E0E10', borderBottom: '1px solid #232329' }}>
        <span className="h-2 w-2 rounded-full bg-[#8B5CF6] shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
        <span className="font-semibold tracking-tight text-[#E6E8F0]">Structural diff</span>
        <span className="ml-auto font-mono text-xs tabular-nums text-[#7A7F93]">{diffs.length} change{diffs.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="max-h-[420px] divide-y divide-[#1E1E24] overflow-auto">
        {diffs.slice(0, 100).map((d, i) => {
          const isAdded = d.type === 'added';
          const isRemoved = d.type === 'removed';
          const Icon = isAdded ? Plus : isRemoved ? Minus : Pencil;
          const color = isAdded ? '#10B981' : isRemoved ? '#EF4444' : '#F59E0B';
          const bg = isAdded ? 'rgba(16,185,129,0.08)' : isRemoved ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)';
          return (
            <div
              key={i}
              className="flex items-start gap-2.5 px-3 py-2.5 font-mono text-xs transition-colors hover:bg-[#16161A] animate-fadeUp"
              style={{ background: bg, borderLeft: `2px solid ${color}`, animationDelay: `${i * 12}ms` }}
            >
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
                style={{ background: `${color}18`, border: `1px solid ${color}33`, color }}
              >
                <Icon size={10} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex px-1 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ background: `${color}16`, color, border: `1px solid ${color}30`, letterSpacing: '0.06em' }}
                  >
                    {d.type}
                  </span>
                  <span className="truncate font-medium text-[#E6E8F0]">{d.path}</span>
                </div>
                {d.type === 'changed' && (
                  <span className="mt-1 block truncate text-[#7A7F93]">
                    <span className="text-[#8B5CF6]">{JSON.stringify(d.expected)}</span>
                    <span className="mx-1 text-[#232329]">→</span>
                    <span className="text-[#E6E8F0]">{JSON.stringify(d.actual)}</span>
                  </span>
                )}
                {d.type === 'added' && <span className="mt-1 block truncate text-[#10B981]">+ {JSON.stringify(d.actual)}</span>}
                {d.type === 'removed' && <span className="mt-1 block truncate text-[#EF4444]">− {JSON.stringify(d.expected)}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {diffs.length > 100 && (
        <div className="px-3 py-2 text-center font-mono text-xs tabular-nums text-[#7A7F93]" style={{ background: '#0E0E10', borderTop: '1px solid #232329' }}>
          +{diffs.length - 100} more — truncated to 100
        </div>
      )}
    </div>
  );
}
