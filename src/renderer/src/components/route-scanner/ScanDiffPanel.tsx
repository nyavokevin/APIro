import { useState } from 'react';
import { TrendingUp, Plus, Minus, Pencil, ChevronDown, ChevronUp, AlertTriangle, Clock } from 'lucide-react';
import type { ScanDiff } from '../../lib/scanner/scanDiff';
import { METHOD_COLORS } from '@shared/constants/methods';

function methodColor(m: string): string {
  return (METHOD_COLORS as Record<string, string>)[m as keyof typeof METHOD_COLORS] ?? '#9FA3B5';
}

interface Props {
  diff: ScanDiff | null;
  previousLabel?: string; // e.g. "2h ago"
}

export function ScanDiffPanel({ diff, previousLabel }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!diff || (diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0)) {
    return null;
  }

  const total = diff.added.length + diff.removed.length + diff.modified.length;
  const hasAuthChange = diff.modified.some((m) => m.changes.some((c) => c.field === 'auth_required'));

  return (
    <div className="overflow-hidden animate-fadeUp" style={{ background: '#0E0E10', border: '1px solid #232329', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
      <div
        className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer select-none"
        style={{ background: hasAuthChange ? 'rgba(239,68,68,0.08)' : 'rgba(139,92,246,0.08)', borderBottom: expanded ? '1px solid #232329' : 'none' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center" style={{ background: hasAuthChange ? 'rgba(239,68,68,0.14)' : 'rgba(139,92,246,0.12)', border: `1px solid ${hasAuthChange ? 'rgba(239,68,68,0.28)' : 'rgba(139,92,246,0.22)'}`, color: hasAuthChange ? '#EF4444' : '#8B5CF6' }}>
            <TrendingUp size={13} />
          </span>
          <span className="text-sm font-semibold" style={{ color: '#E6E8F0' }}>
            Changes since last scan{previousLabel ? ` (${previousLabel})` : ''}
          </span>
          {hasAuthChange && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)', color: '#EF4444' }}><AlertTriangle size={10} /> auth change</span>}
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono tabular-nums" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.22)', color: '#10B981' }}><Plus size={10} /> {diff.added.length}</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono tabular-nums" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)', color: '#EF4444' }}><Minus size={10} /> {diff.removed.length}</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono tabular-nums" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.22)', color: '#F59E0B' }}><Pencil size={10} /> {diff.modified.length}</span>
          {expanded ? <ChevronUp size={14} style={{ color: '#9FA3B5' }} /> : <ChevronDown size={14} style={{ color: '#9FA3B5' }} />}
        </div>
      </div>

      <div className="px-3 py-2 flex items-center gap-1.5 text-xs" style={{ background: hasAuthChange ? 'rgba(239,68,68,0.06)' : 'transparent', color: '#9FA3B5' }}>
        <span className="inline-flex items-center gap-1"><Plus size={10} style={{ color: '#10B981' }} /> {diff.added.length} added</span>
        <span className="h-3 w-px" style={{ background: '#232329' }} />
        <span className="inline-flex items-center gap-1"><Minus size={10} style={{ color: '#EF4444' }} /> {diff.removed.length} removed</span>
        <span className="h-3 w-px" style={{ background: '#232329' }} />
        <span className="inline-flex items-center gap-1"><Pencil size={10} style={{ color: '#F59E0B' }} /> {diff.modified.length} modified</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px]" style={{ color: '#5A5E6E' }}><Clock size={10} /> {total} total</span>
        <button onClick={() => setExpanded((v) => !v)} className="ml-2 text-xs hover:underline" style={{ color: '#8B5CF6' }}>{expanded ? 'Hide' : 'View details ▾'}</button>
      </div>

      {expanded && (
        <div className="border-t p-2 space-y-3 max-h-[360px] overflow-auto" style={{ borderColor: '#232329', background: '#070709' }}>
          {diff.added.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#10B981' }}><Plus size={11} /> Added ({diff.added.length})</div>
              <div className="space-y-1">
                {diff.added.map((r) => (
                  <div key={`added-${r.method}:${r.path}`} className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', borderLeft: '2px solid #10B981' }}>
                    <span className="w-[56px] text-center font-mono text-[11px] font-bold px-1 py-0.5" style={{ background: '#121215', border: '1px solid #232329', color: methodColor(r.method) }}>{r.method}</span>
                    <span className="flex-1 truncate font-mono text-xs" style={{ color: '#E6E8F0' }}>{r.path}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: '#10B981', color: 'white' }}>NEW</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {diff.removed.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#EF4444' }}><Minus size={11} /> Removed ({diff.removed.length})</div>
              <div className="space-y-1">
                {diff.removed.map((r) => (
                  <div key={`removed-${r.method}:${r.path}`} className="flex items-center gap-2 px-2.5 py-1.5 opacity-70" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderLeft: '2px solid #EF4444' }}>
                    <span className="w-[56px] text-center font-mono text-[11px] font-bold px-1 py-0.5 line-through" style={{ background: '#121215', border: '1px solid #232329', color: methodColor(r.method) }}>{r.method}</span>
                    <span className="flex-1 truncate font-mono text-xs line-through" style={{ color: '#9FA3B5' }}>{r.path}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: '#EF4444', color: 'white' }}>REMOVED</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {diff.modified.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#F59E0B' }}><Pencil size={11} /> Modified ({diff.modified.length})</div>
              <div className="space-y-1.5">
                {diff.modified.map((mc) => {
                  const isAuth = mc.changes.some((c) => c.field === 'auth_required');
                  return (
                    <div key={`mod-${mc.route.method}:${mc.route.path}`} className="px-2.5 py-2" style={{ background: isAuth ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.06)', border: `1px solid ${isAuth ? 'rgba(239,68,68,0.22)' : 'rgba(245,158,11,0.18)'}`, borderLeft: `2px solid ${isAuth ? '#EF4444' : '#F59E0B'}` }}>
                      <div className="flex items-center gap-2">
                        <span className="w-[56px] text-center font-mono text-[11px] font-bold px-1 py-0.5" style={{ background: '#121215', border: '1px solid #232329', color: methodColor(mc.route.method) }}>{mc.route.method}</span>
                        <span className="flex-1 truncate font-mono text-xs font-medium" style={{ color: '#E6E8F0' }}>{mc.route.path}</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: isAuth ? '#EF4444' : '#F59E0B', color: 'white' }}>{isAuth ? 'CRITICAL' : 'MODIFIED'}</span>
                      </div>
                      <div className="mt-1.5 space-y-1">
                        {mc.changes.map((c, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 font-mono text-xs" style={{ color: c.field === 'auth_required' ? '#FCA5A5' : '#9FA3B5' }}>
                            <span className="shrink-0 px-1 py-0.5 text-[10px] font-bold" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>{c.field}</span>
                            <span className="truncate px-1 py-0.5" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)', color: '#EF4444', textDecoration: 'line-through' }}>{c.oldValue}</span>
                            <span style={{ color: '#5A5E6E' }}>→</span>
                            <span className="truncate px-1 py-0.5" style={{ background: c.field === 'auth_required' ? 'rgba(239,68,68,0.14)' : 'rgba(16,185,129,0.12)', border: `1px solid ${c.field === 'auth_required' ? 'rgba(239,68,68,0.28)' : 'rgba(16,185,129,0.22)'}`, color: c.field === 'auth_required' ? '#EF4444' : '#10B981' }}>{c.newValue}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
