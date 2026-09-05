import { Globe, AlertTriangle, Layers } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { useMemo } from 'react';

function isProductionEnv(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  return n.includes('prod') || n === 'live' || n.includes('production');
}
function isNonLocal(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  if (n === 'local' || n === 'dev' || n === 'development') return false;
  return true;
}

export function EnvironmentStatusBar() {
  const environments = useWorkspaceStore((s) => s.environments);
  const activeId = useWorkspaceStore((s) => s.activeEnvironmentId);
  const activeEnv = useMemo(() => environments.find((e) => e.id === activeId) ?? null, [environments, activeId]);

  const varsTotal = activeEnv?.variables.length ?? 0;
  const varsUnresolved = activeEnv?.variables.filter((v) => !v.value).length ?? 0;
  const isProd = isProductionEnv(activeEnv?.name);
  const isNonLocalEnv = isNonLocal(activeEnv?.name);

  const handleSwitch = () => useUiStore.getState().setActivePage('environments');

  if (!activeEnv) {
    return (
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#121215', border: '1px solid #232329' }}>
        <span className="flex h-7 w-7 items-center justify-center" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#7A7F93' }}>
          <Globe size={14} />
        </span>
        <span className="text-sm" style={{ color: '#9FA3B5' }}>No environment selected</span>
        <button onClick={handleSwitch} className="ml-auto text-xs font-medium hover:underline" style={{ color: '#8B5CF6' }}>Switch →</button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 transition-colors"
      style={{
        background: isProd ? 'rgba(239,68,68,0.08)' : isNonLocalEnv ? 'rgba(245,158,11,0.08)' : '#121215',
        border: `1px solid ${isProd ? 'rgba(239,68,68,0.22)' : isNonLocalEnv ? 'rgba(245,158,11,0.22)' : '#232329'}`,
        borderLeft: isProd ? '2px solid #EF4444' : isNonLocalEnv ? '2px solid #F59E0B' : '1px solid #232329',
      }}
    >
      <span className="flex h-7 w-7 items-center justify-center" style={{ background: isProd ? 'rgba(239,68,68,0.14)' : isNonLocalEnv ? 'rgba(245,158,11,0.14)' : '#0E0E10', border: `1px solid ${isProd ? 'rgba(239,68,68,0.22)' : isNonLocalEnv ? 'rgba(245,158,11,0.22)' : '#232329'}`, color: isProd ? '#EF4444' : isNonLocalEnv ? '#F59E0B' : '#8B5CF6' }}>
        <Globe size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight" style={{ color: isProd ? '#FCA5A5' : '#E6E8F0' }}>Environment: {activeEnv.name}</span>
          {isProd && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: '#EF4444', color: 'white' }}><AlertTriangle size={10} /> prod</span>}
          {!isProd && isNonLocalEnv && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ background: '#F59E0B', color: 'black' }}>staging</span>}
        </div>
        <div className="flex items-center gap-2 text-xs tabular-nums" style={{ color: isProd ? '#FCA5A5' : '#9FA3B5' }}>
          <span className="inline-flex items-center gap-1"><Layers size={11} style={{ color: isProd ? '#EF4444' : '#8B5CF6' }} /> {varsTotal} vars</span>
          {varsUnresolved > 0 ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.18)', color: '#EF4444' }}>
              <AlertTriangle size={10} /> {varsUnresolved} unresolved
            </span>
          ) : (
            <span style={{ color: '#10B981' }}>all resolved</span>
          )}
        </div>
      </div>
      <button onClick={handleSwitch} className="shrink-0 text-xs font-medium px-2.5 py-1.5 hover:underline" style={{ background: isProd ? 'rgba(239,68,68,0.12)' : '#0E0E10', border: `1px solid ${isProd ? 'rgba(239,68,68,0.22)' : '#232329'}`, color: isProd ? '#FCA5A5' : '#8B5CF6' }}>
        Switch
      </button>
    </div>
  );
}
