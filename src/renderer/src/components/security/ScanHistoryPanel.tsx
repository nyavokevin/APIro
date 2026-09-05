import { useState } from 'react';
import { Clock, MoreVertical, Play, Trash2, GitCompare, Shield, ScanSearch } from 'lucide-react';
import { useSecurityStore, type ScanRecord } from '../../stores/securityStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useRequestStore } from '../../stores/requestStore';
import { useEnvironmentStore } from '../../stores/environmentStore';

function relativeTime(ts: number): string {
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

function severityDots(counts: ScanRecord['severityCounts']) {
  const parts: Array<[string, number, string]> = [
    ['critical', counts.critical, '#EF4444'],
    ['high', counts.high, '#F97316'],
    ['medium', counts.medium, '#F59E0B'],
    ['low', counts.low, '#7A7F93'],
  ];
  return parts.filter(([, c]) => c > 0);
}

export function ScanHistoryPanel() {
  const scans = useSecurityStore((s) => s.scans);
  const selectedScanId = useSecurityStore((s) => s.selectedScanId);
  const setSelectedScanId = useSecurityStore((s) => s.setSelectedScanId);
  const deleteScan = useSecurityStore((s) => s.deleteScan);
  const clearScans = useSecurityStore((s) => s.clearScans);
  const [menuId, setMenuId] = useState<string | null>(null);

  const handleRerun = (scan: ScanRecord) => {
    const tabs = useRequestStore.getState().tabs;
    const envName = useEnvironmentStore.getState().environments.find((e) => e.id === useEnvironmentStore.getState().activeId)?.name ?? null;
    let total = 0;
    for (const reqId of scan.requestIds) {
      const tab = tabs.find((t) => t.id === reqId);
      if (tab?.response) {
        const fresh = useSecurityStore.getState().runPassiveScanForRequest(tab.request, tab.response);
        total += fresh.length;
      }
    }
    useNotificationStore.getState().addToast({
      variant: total ? 'warning' : 'success',
      title: total ? `${total} findings on re-run` : 'Re-run clean',
      description: `Re-ran ${scan.requestIds.length} request(s) · ${envName ?? 'Local'}`,
    });
  };

  return (
    <div className="flex h-full w-[296px] shrink-0 flex-col bg-[#0E0E10]" style={{ borderRight: '1px solid #232329' }}>
      <div className="flex items-center justify-between px-3.5 py-3 shrink-0" style={{ borderBottom: '1px solid #232329', background: '#070709' }}>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#9FA3B5]">
          <span className="flex h-6 w-6 items-center justify-center bg-[#121215] text-[#8B5CF6]" style={{ border: '1px solid #232329' }}>
            <Clock size={12} strokeWidth={1.8} />
          </span>
          Scan History
        </span>
        <span
          className="inline-flex items-center justify-center px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#E6E8F0]"
          style={{ background: '#121215', border: '1px solid #232329' }}
        >
          {scans.length}
        </span>
      </div>

      {scans.length > 0 && (
        <div className="flex items-center justify-between px-3.5 py-2 shrink-0" style={{ borderBottom: '1px solid #1E1E24', background: '#121215' }}>
          <span className="font-mono text-xs tabular-nums text-[#7A7F93]">{scans.length} scan{scans.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => {
              clearScans();
              useNotificationStore.getState().addToast({ variant: 'info', title: 'History cleared' });
            }}
            className="px-2 py-1 text-xs font-medium text-[#7A7F93] hover:bg-[#070709] hover:text-[#E6E8F0] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E10]"
            style={{ border: '1px solid transparent' }}
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {scans.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center animate-fadeUp">
            <div className="flex h-11 w-11 items-center justify-center bg-[#121215] text-[#7A7F93]" style={{ border: '1px solid #232329' }}>
              <ScanSearch size={18} strokeWidth={1.5} />
            </div>
            <p className="text-xs font-semibold tracking-tight text-[#E6E8F0]">No scans yet</p>
            <p className="max-w-[22ch] text-xs leading-relaxed text-[#7A7F93]">
              Run a passive scan from Workspace or click Scan all. Each run is saved here with env + severity breakdown.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#1E1E24] p-2">
            {scans.map((scan, idx) => {
              const isSelected = selectedScanId === scan.id;
              const dots = severityDots(scan.severityCounts);
              return (
                <li
                  key={scan.id}
                  onClick={() => setSelectedScanId(isSelected ? null : scan.id)}
                  className={`group relative cursor-pointer bg-[#121215] px-3 py-3 transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#16161A] hover:border-[#2E2E36] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0E0E10] animate-fadeUp`}
                  style={{
                    border: `1px solid ${isSelected ? '#8B5CF6' : '#232329'}`,
                    borderLeft: `2px solid ${isSelected ? '#8B5CF6' : '#232329'}`,
                    boxShadow: isSelected ? '0 0 0 3px rgba(139,92,246,0.10), 0 4px 16px rgba(0,0,0,0.2)' : 'none',
                    animationDelay: `${idx * 18}ms`,
                    marginBottom: '8px',
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedScanId(isSelected ? null : scan.id);
                    }
                  }}
                  role="button"
                  aria-pressed={isSelected}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold tracking-tight text-[#E6E8F0]">{scan.label ?? `${scan.type} #${scan.id.slice(-4)}`}</span>
                        <span
                          className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
                          style={{
                            background: scan.type === 'passive' ? 'rgba(139,92,246,0.12)' : scan.type === 'bola' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            color: scan.type === 'passive' ? '#8B5CF6' : scan.type === 'bola' ? '#EF4444' : '#F59E0B',
                            border: `1px solid ${scan.type === 'passive' ? 'rgba(139,92,246,0.30)' : scan.type === 'bola' ? 'rgba(239,68,68,0.30)' : 'rgba(245,158,11,0.30)'}`,
                            letterSpacing: '0.06em',
                          }}
                        >
                          {scan.type}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-[#7A7F93]">
                        <span className="tabular-nums">{relativeTime(scan.timestamp)}</span>
                        <span className="h-1 w-1 rounded-full bg-[#232329]" />
                        <span className="truncate font-mono text-[11px] tabular-nums">
                          {scan.environment ?? 'Local'} · {scan.requestCount} req
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {dots.length === 0 ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium tabular-nums text-[#10B981]" style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.18)' }}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                            0 findings
                          </span>
                        ) : (
                          dots.map(([sev, count, color]) => (
                            <span
                              key={sev}
                              className="inline-flex items-center gap-1 px-1.5 py-1 text-[11px] font-semibold tabular-nums"
                              style={{ background: `${color}14`, color, border: `1px solid ${color}30` }}
                            >
                              <span style={{ width: '6px', height: '6px', borderRadius: '9999px', background: color }} />
                              {count}
                            </span>
                          ))
                        )}
                        <span className="ml-auto font-mono text-xs tabular-nums text-[#7A7F93]">{scan.findingCount} total</span>
                      </div>
                    </div>
                    <div className="relative shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId(menuId === scan.id ? null : scan.id);
                        }}
                        className="flex h-7 w-7 items-center justify-center bg-[#070709] text-[#7A7F93] hover:bg-[#1E1E24] hover:text-[#E6E8F0] active:scale-[0.96] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)]"
                        style={{ border: '1px solid #232329' }}
                        aria-label="Scan actions"
                      >
                        <MoreVertical size={14} />
                      </button>
                      {menuId === scan.id && (
                        <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden bg-[#121215] py-1 shadow-xl animate-fadeUp" style={{ border: '1px solid #232329' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuId(null);
                              handleRerun(scan);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[#E6E8F0] hover:bg-[#16161A]"
                          >
                            <Play size={12} className="text-[#8B5CF6]" /> Re-run this scan
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuId(null);
                              useNotificationStore.getState().addToast({ variant: 'info', title: 'Compare', description: 'Diff view coming next — will show delta vs previous scan.' });
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#7A7F93] hover:bg-[#16161A] hover:text-[#E6E8F0]"
                          >
                            <GitCompare size={12} /> Compare to previous
                          </button>
                          <div className="my-1 h-px bg-[#1E1E24]" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuId(null);
                              deleteScan(scan.id);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)]"
                          >
                            <Trash2 size={12} /> Delete from history
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 px-3.5 py-3" style={{ borderTop: '1px solid #232329', background: '#070709' }}>
        <p className="flex items-center gap-1.5 text-xs leading-relaxed text-[#7A7F93]">
          <Shield size={12} className="shrink-0 text-[#7A7F93]" /> Click a scan to filter findings on the right. Passive scans are read-only; BOLA hits live.
        </p>
      </div>
    </div>
  );
}
