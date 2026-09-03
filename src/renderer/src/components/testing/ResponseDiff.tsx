import { useMemo } from 'react';
import { structuralDiff } from '../../lib/testExecutor';

interface ResponseDiffProps {
  baseline: unknown;
  current: unknown;
}

export function ResponseDiff({ baseline, current }: ResponseDiffProps) {
  const diffs = useMemo(()=> structuralDiff(baseline, current), [baseline, current]);
  if (diffs.length===0) return <div className="text-xs text-[#10B981]">No differences — identical</div>;
  return (
    <div className="space-y-1 font-mono text-xs">
      {diffs.slice(0,100).map((d,i)=>(
        <div key={i} className="flex gap-2 px-2 py-1" style={{ background: d.type==='added'?'rgba(16,185,129,0.10)':d.type==='removed'?'rgba(239,68,68,0.10)':'rgba(251,191,36,0.10)', borderLeft: `2px solid ${d.type==='added'?'#10B981':d.type==='removed'?'#EF4444':'#FBBF24'}` }}>
          <span className="shrink-0 text-[#8F909E]">{d.type}</span>
          <span className="truncate text-[#E2E8F0]">{d.path}</span>
          {d.type==='changed' && <span className="truncate text-[#8F909E]">{JSON.stringify(d.expected)} → {JSON.stringify(d.actual)}</span>}
          {d.type==='added' && <span className="truncate text-[#10B981]">+ {JSON.stringify(d.actual)}</span>}
          {d.type==='removed' && <span className="truncate text-[#EF4444]">- {JSON.stringify(d.expected)}</span>}
        </div>
      ))}
      {diffs.length>100 && <div className="text-xs text-[#8F909E]">+{diffs.length-100} more</div>}
    </div>
  );
}
