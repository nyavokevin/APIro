import { Shield, AlertTriangle, TrendingDown, TrendingUp, Clock } from 'lucide-react';
import { useSecurityStore } from '../../stores/securityStore';
import { useUiStore } from '../../stores/uiStore';

export function SecuritySummaryCard() {
  const findings = useSecurityStore((s) => s.findings);
  const scans = useSecurityStore((s) => s.scans);

  const active = findings.filter((f) => !f.dismissed && (f.status ?? 'open') === 'open');
  const criticalOpen = active.filter((f) => f.severity === 'critical').length;
  const highOpen = active.filter((f) => f.severity === 'high').length;
  const lastScan = scans[0];
  const prevScan = scans[1];
  const trend = lastScan && prevScan ? lastScan.findingCount - prevScan.findingCount : null;
  const hasCritical = criticalOpen > 0;

  const handleClick = () => useUiStore.getState().setActivePage('security');

  return (
    <button
      onClick={handleClick}
      className="group flex w-full flex-col text-left transition-all duration-200 hover:-translate-y-[1px] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
      style={{
        background: '#121215',
        border: '1px solid #232329',
        borderLeft: hasCritical ? '2px solid #EF4444' : lastScan ? '2px solid #8B5CF6' : '2px solid #232329',
        boxShadow: hasCritical ? '0 0 16px rgba(239,68,68,0.10)' : '0 1px 6px rgba(0,0,0,0.18)',
      }}
    >
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid #1E1E24' }}>
        <span className="flex h-7 w-7 items-center justify-center" style={{ background: hasCritical ? 'rgba(239,68,68,0.12)' : 'rgba(139,92,246,0.12)', border: `1px solid ${hasCritical ? 'rgba(239,68,68,0.22)' : 'rgba(139,92,246,0.22)'}`, color: hasCritical ? '#EF4444' : '#8B5CF6' }}>
          <Shield size={14} />
        </span>
        <span className="text-sm font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.01em' }}>Security</span>
        <span className="ml-auto text-xs tabular-nums px-1.5 py-0.5" style={{ background: hasCritical ? 'rgba(239,68,68,0.10)' : '#0E0E10', border: `1px solid ${hasCritical ? 'rgba(239,68,68,0.18)' : '#232329'}`, color: hasCritical ? '#EF4444' : '#7A7F93' }}>
          {active.length} open
        </span>
      </div>

      <div className="flex-1 p-4">
        {!lastScan ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: '#9FA3B5' }}>Not scanned yet</p>
            <p className="text-xs leading-relaxed" style={{ color: '#7A7F93' }}>No scan has been run. Findings will appear here after your first scan.</p>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#8B5CF6' }}>Run scan →</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tabular-nums" style={{ color: hasCritical ? '#EF4444' : '#E6E8F0' }}>{criticalOpen}</span>
              <span className="text-sm" style={{ color: '#9FA3B5' }}>critical ·</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: highOpen > 0 ? '#F59E0B' : '#E6E8F0' }}>{highOpen}</span>
              <span className="text-sm" style={{ color: '#9FA3B5' }}>high open</span>
            </div>

            {trend !== null && (
              <div className="inline-flex items-center gap-1.5 text-xs tabular-nums px-2 py-1" style={{ background: trend < 0 ? 'rgba(16,185,129,0.08)' : trend > 0 ? 'rgba(239,68,68,0.08)' : '#0E0E10', border: `1px solid ${trend < 0 ? 'rgba(16,185,129,0.18)' : trend > 0 ? 'rgba(239,68,68,0.18)' : '#232329'}`, color: trend < 0 ? '#10B981' : trend > 0 ? '#EF4444' : '#7A7F93' }}>
                {trend < 0 ? <TrendingDown size={12} /> : trend > 0 ? <TrendingUp size={12} /> : <Clock size={12} />}
                {trend === 0 ? 'No change' : `${trend > 0 ? '+' : ''}${trend} since last scan`}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#5A5E6E' }}>
              <Clock size={11} /> Last scan: {lastScan ? formatRelative(lastScan.timestamp) : '—'}
              {lastScan && <span className="ml-auto tabular-nums" style={{ color: '#7A7F93' }}>{lastScan.findingCount} findings · {lastScan.requestCount} req</span>}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium" style={{ background: '#0E0E10', borderTop: '1px solid #232329', color: '#8B5CF6' }}>
        <span className="group-hover:underline">View →</span>
        {hasCritical && <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase" style={{ color: '#EF4444' }}><AlertTriangle size={10} /> attention</span>}
      </div>
    </button>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}
