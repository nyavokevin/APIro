import { useMemo, useState } from 'react';
import { Shield, Search, Trash2, Filter, ArrowLeft, ExternalLink, CheckCircle2, X, Clock, ShieldAlert, Zap } from 'lucide-react';
import { useSecurityStore, type SecuritySeverity, type SecurityFinding, type FindingStatus } from '../stores/securityStore';
import { useUiStore } from '../stores/uiStore';
import { useRequestStore } from '../stores/requestStore';
import { Button } from '../components/ui/Button';
import { useNotificationStore } from '../stores/notificationStore';
import { ScanHistoryPanel } from '../components/security/ScanHistoryPanel';
import { FindingDetailDrawer } from '../components/security/FindingDetailDrawer';

const SEVERITY_ORDER: Record<SecuritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEVERITY_COLOR: Record<SecuritySeverity, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#7A7F93',
  info: '#60A5FA',
};

function SeverityPill({ severity }: { severity: SecuritySeverity }) {
  const c = SEVERITY_COLOR[severity];
  const isHot = severity === 'critical' || severity === 'high';
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tabular-nums tracking-wide"
      style={{
        color: c,
        background: `${c}14`,
        border: `1px solid ${c}30`,
        padding: '3px 7px',
        letterSpacing: '0.04em',
      }}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {isHot && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ background: c }} />}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: c }} />
      </span>
      {severity.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: FindingStatus }) {
  const map: Record<FindingStatus, { label: string; color: string; bg: string }> = {
    open: { label: 'Open', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    ignored: { label: 'Ignored', color: '#7A7F93', bg: 'rgba(122,127,147,0.10)' },
    resolved: { label: 'Resolved', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  };
  const m = map[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium tabular-nums" style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}28` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function SecurityPage() {
  const findings = useSecurityStore((s) => s.findings);
  const scans = useSecurityStore((s) => s.scans);
  const selectedRequestId = useSecurityStore((s) => s.selectedRequestId);
  const setSelectedRequestId = useSecurityStore((s) => s.setSelectedRequestId);
  const selectedScanId = useSecurityStore((s) => s.selectedScanId);
  const setSelectedScanId = useSecurityStore((s) => s.setSelectedScanId);
  const updateFindingStatus = useSecurityStore((s) => s.updateFindingStatus);
  const clearAll = useSecurityStore((s) => s.clearAll);
  const runPassiveScanForRequest = useSecurityStore((s) => s.runPassiveScanForRequest);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const tabs = useRequestStore((s) => s.tabs);

  const [severityFilter, setSeverityFilter] = useState<SecuritySeverity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<FindingStatus | 'all'>('open');
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'severity' | 'endpoint' | 'category'>('none');
  const [detailFinding, setDetailFinding] = useState<SecurityFinding | null>(null);

  const requestNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tabs) m.set(t.id, `${t.request.method} ${t.request.url || t.request.name}`);
    return m;
  }, [tabs]);

  const lastScan = scans[0] ?? null;

  const filtered = useMemo(() => {
    let list = findings.filter((f) => {
      const s = f.status ?? (f.dismissed ? 'ignored' : 'open');
      if (statusFilter !== 'all' && s !== statusFilter) return false;
      return true;
    });
    if (selectedScanId) {
      const scan = scans.find((sc) => sc.id === selectedScanId);
      if (scan) list = list.filter((f) => scan.findingIds.includes(f.id));
    } else if (selectedRequestId) {
      list = list.filter((f) => f.requestId === selectedRequestId);
    }
    if (severityFilter !== 'all') list = list.filter((f) => f.severity === severityFilter);
    if (categoryFilter !== 'all') list = list.filter((f) => f.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.ruleId.toLowerCase().includes(q) || (f.endpoint ?? '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.timestamp - a.timestamp);
  }, [findings, selectedRequestId, selectedScanId, scans, severityFilter, categoryFilter, statusFilter, search]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [['All', filtered] as const];
    const map = new Map<string, SecurityFinding[]>();
    for (const f of filtered) {
      let key = 'Other';
      if (groupBy === 'severity') key = f.severity;
      else if (groupBy === 'category') key = f.category;
      else if (groupBy === 'endpoint') key = f.endpoint ?? requestNameMap.get(f.requestId) ?? f.requestId;
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    const entries = Array.from(map.entries());
    if (groupBy === 'severity') entries.sort((a, b) => (SEVERITY_ORDER[a[0] as SecuritySeverity] ?? 99) - (SEVERITY_ORDER[b[0] as SecuritySeverity] ?? 99));
    else entries.sort((a, b) => a[0].localeCompare(b[0]));
    return entries;
  }, [filtered, groupBy, requestNameMap]);

  const totalActive = findings.filter((f) => (f.status ?? (f.dismissed ? 'ignored' : 'open')) === 'open').length;
  const scopedLabel = selectedScanId ? scans.find((s) => s.id === selectedScanId)?.label ?? selectedScanId : selectedRequestId ? requestNameMap.get(selectedRequestId) ?? selectedRequestId : null;

  const handleScanAll = () => {
    let count = 0;
    for (const t of tabs) {
      if (t.response) count += runPassiveScanForRequest(t.request, t.response).length;
    }
    useNotificationStore.getState().addToast({ variant: count ? 'warning' : 'success', title: count ? `${count} total findings` : 'No issues', description: 'Scanned all responses' });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#070709]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 shrink-0 px-6 py-4" style={{ background: '#070709', borderBottom: '1px solid #232329' }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[rgba(139,92,246,0.12)] text-[#8B5CF6]" style={{ border: '1px solid rgba(139,92,246,0.22)' }}>
          <Shield size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-base font-semibold tracking-tight text-[#E6E8F0]" style={{ letterSpacing: '-0.02em' }}>
              Security
            </h1>
            <span
              className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-xs font-medium tabular-nums"
              style={{ background: '#121215', border: '1px solid #232329', color: '#9FA3B5' }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6] shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
              {filtered.length} finding(s) · {totalActive} open
            </span>
            {lastScan && (
              <span className="hidden items-center gap-1.5 font-mono text-xs tabular-nums text-[#7A7F93] sm:inline-flex" style={{ letterSpacing: '-0.01em' }}>
                <Clock size={12} /> Last scan: {new Date(lastScan.timestamp).toLocaleTimeString()} · {lastScan.requestCount} req · {lastScan.environment ?? 'Local'}
              </span>
            )}
            {scopedLabel && (
              <span className="inline-flex items-center gap-1.5 bg-[#121215] px-2.5 py-1 font-mono text-xs text-[#E6E8F0]" style={{ border: '1px solid #232329' }}>
                <Filter size={10} className="text-[#8B5CF6]" /> Filtered: <span className="max-w-[260px] truncate font-medium">{scopedLabel}</span>
                <button
                  onClick={() => {
                    setSelectedScanId(null);
                    setSelectedRequestId(null);
                  }}
                  className="ml-1 flex h-5 w-5 items-center justify-center bg-[#070709] text-[#7A7F93] hover:bg-[#1E1E24] hover:text-[#E6E8F0] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)]"
                  style={{ border: '1px solid #232329' }}
                  title="Clear filter"
                  aria-label="Clear filter"
                >
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
          <p className="mt-1 hidden text-xs leading-relaxed text-[#7A7F93] sm:block">Two panes: scan history (what ran) + findings (what’s wrong). Click a scan to filter findings.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setActivePage('workspace')} className="hover:-translate-y-[1px] active:translate-y-0">
            <ArrowLeft size={14} /> Back to Workspace
          </Button>
          <Button variant="secondary" size="sm" onClick={handleScanAll} className="hover:-translate-y-[1px] hover:border-[#2E2E36] active:translate-y-0">
            <Search size={14} /> Scan all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearAll();
              useNotificationStore.getState().addToast({ variant: 'info', title: 'Cleared all findings and scans' });
            }}
            className="hover:text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)] hover:-translate-y-[1px] active:translate-y-0"
          >
            <Trash2 size={14} /> Clear
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5 bg-[#0E0E10] px-6 py-3 shrink-0" style={{ borderBottom: '1px solid #232329' }}>
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[#7A7F93]" style={{ letterSpacing: '0.07em' }}>
          <Filter size={13} /> Filters
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as never)}
          className="bg-[#121215] px-3 py-1.5 text-xs font-medium text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.14)]"
          style={{ border: '1px solid #232329', height: '34px' }}
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-[#121215] px-3 py-1.5 text-xs font-medium text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.14)]"
          style={{ border: '1px solid #232329', height: '34px' }}
        >
          <option value="all">All categories</option>
          <option value="headers">Headers</option>
          <option value="auth">Auth / CORS</option>
          <option value="transport">Transport</option>
          <option value="exposure">Exposure</option>
          <option value="injection">Injection</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as never)}
          className="bg-[#121215] px-3 py-1.5 text-xs font-medium text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.14)]"
          style={{ border: '1px solid #232329', height: '34px' }}
        >
          <option value="all">All statuses</option>
          <option value="open">Open only</option>
          <option value="ignored">Ignored</option>
          <option value="resolved">Resolved</option>
        </select>
        <div className="hidden items-center gap-2 text-xs font-medium text-[#7A7F93] sm:flex">
          <span className="uppercase tracking-widest" style={{ letterSpacing: '0.06em' }}>
            Group by
          </span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as never)}
            className="bg-[#121215] px-3 py-1.5 text-xs font-medium text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.14)]"
            style={{ border: '1px solid #232329', height: '34px' }}
          >
            <option value="none">None</option>
            <option value="severity">Severity</option>
            <option value="endpoint">Endpoint</option>
            <option value="category">Category</option>
          </select>
        </div>
        <div className="relative ml-auto w-full sm:ml-2 sm:w-auto">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7A7F93]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search findings…"
            className="w-full bg-[#121215] pl-8 pr-3 text-xs font-medium text-[#E6E8F0] placeholder:text-[#5A5E6E] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.12)] sm:w-[240px]"
            style={{ border: '1px solid #232329', height: '34px' }}
          />
        </div>
      </div>

      {/* Two-pane */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ScanHistoryPanel />
        <div className="flex min-w-0 flex-1 flex-col bg-[#070709]">
          <div className="flex-1 overflow-auto" style={{ padding: '16px 20px' }}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center animate-fadeUp" style={{ border: '1px dashed #232329', background: '#0E0E10' }}>
                {totalActive === 0 ? (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center bg-[rgba(16,185,129,0.10)] text-[#10B981]" style={{ border: '1px solid rgba(16,185,129,0.20)' }}>
                      <CheckCircle2 size={24} strokeWidth={1.7} />
                    </div>
                    <p className="text-sm font-semibold tracking-tight text-[#E6E8F0]">No security findings</p>
                    <p className="max-w-[44ch] text-xs leading-relaxed text-[#7A7F93]">
                      Send requests in Workspace, then Scan. Each run appears in Scan History (left) with env + severity breakdown.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="secondary" size="sm" onClick={handleScanAll} className="hover:-translate-y-[1px] active:translate-y-0 hover:border-[#2E2E36]">
                        <Search size={14} /> Run scan on all responses
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setActivePage('workspace')} className="hover:-translate-y-[1px]">
                        Go to Workspace
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center bg-[#121215] text-[#7A7F93]" style={{ border: '1px solid #232329' }}>
                      <ShieldAlert size={22} strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-medium text-[#E6E8F0]">No findings match filters</p>
                    <p className="text-xs text-[#7A7F93]">Try broadening severity, category, or search.</p>
                    <button
                      onClick={() => {
                        setSeverityFilter('all');
                        setCategoryFilter('all');
                        setStatusFilter('open');
                        setSearch('');
                      }}
                      className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#8B5CF6] hover:bg-[#121215] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)]"
                      style={{ border: '1px solid #232329' }}
                    >
                      <Zap size={12} /> Clear filters (show Open)
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map(([groupLabel, list]) => (
                  <div key={groupLabel} className="animate-fadeUp" style={{ animationDelay: '60ms' }}>
                    {groupBy !== 'none' && (
                      <div
                        className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#7A7F93]"
                        style={{ borderBottom: '1px solid #232329', paddingBottom: '8px', letterSpacing: '0.07em' }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6]" />
                        <span>{groupLabel}</span>
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 font-mono text-xs tabular-nums text-[#E6E8F0]" style={{ background: '#121215', border: '1px solid #232329' }}>
                          {list.length}
                        </span>
                      </div>
                    )}
                    <div className="space-y-2">
                      {list.map((f, idx) => {
                        const status = (f.status ?? (f.dismissed ? 'ignored' : 'open')) as FindingStatus;
                        const sevColor = SEVERITY_COLOR[f.severity];
                        return (
                          <div
                            key={f.id}
                            onClick={() => setDetailFinding(f)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setDetailFinding(f);
                              }
                            }}
                            className="group cursor-pointer bg-[#121215] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[#16161A] hover:border-[#2E2E36] hover:shadow-[0_4px_16px_rgba(0,0,0,0.18)] active:translate-y-0 active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)] focus-visible:ring-offset-1 focus-visible:ring-offset-[#070709] animate-fadeUp"
                            style={{ border: '1px solid #232329', borderLeft: `2px solid ${sevColor}`, animationDelay: `${idx * 18}ms` }}
                          >
                            <div className="flex items-start gap-3 px-3.5 py-3">
                              <span
                                className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0 items-center justify-center"
                                aria-hidden
                              >
                                {(f.severity === 'critical' || f.severity === 'high') && (
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-30" style={{ background: sevColor }} />
                                )}
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: sevColor, boxShadow: `0 0 8px ${sevColor}55` }} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <SeverityPill severity={f.severity} />
                                  {f.owasp && (
                                    <span className="bg-[#070709] px-1.5 py-1 font-mono text-xs tabular-nums text-[#7A7F93]" style={{ border: '1px solid #232329' }}>
                                      {f.owasp}
                                    </span>
                                  )}
                                  <span className="bg-[#070709] px-1.5 py-1 text-xs font-medium capitalize text-[#7A7F93]" style={{ border: '1px solid #232329' }}>
                                    {f.category}
                                  </span>
                                  <StatusBadge status={status} />
                                  <span className="ml-auto hidden items-center gap-1 font-mono text-xs tabular-nums text-[#7A7F93] sm:inline-flex">
                                    <Clock size={11} /> {new Date(f.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex items-center gap-2">
                                  <span className="truncate font-mono text-xs font-semibold tabular-nums text-[#E6E8F0]">{f.endpoint ?? requestNameMap.get(f.requestId) ?? f.requestId}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const tab = tabs.find((t) => t.id === f.requestId);
                                      if (tab) {
                                        useRequestStore.getState().setActiveTab(tab.id);
                                        useUiStore.getState().setActivePage('workspace');
                                      }
                                    }}
                                    className="flex h-6 w-6 shrink-0 items-center justify-center bg-[#070709] text-[#7A7F93] hover:bg-[#1E1E24] hover:text-[#8B5CF6] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)]"
                                    style={{ border: '1px solid #232329' }}
                                    title="Open request in Workspace"
                                    aria-label="Open request"
                                  >
                                    <ExternalLink size={12} />
                                  </button>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#9FA3B5]">{f.description}</p>
                                <p className="mt-1.5 font-mono text-xs tabular-nums text-[#7A7F93]">
                                  Detected: {new Date(f.timestamp).toLocaleString()} · Status: <span className="capitalize font-medium text-[#E6E8F0]">{status}</span>
                                </p>
                              </div>
                              <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const reason = window.prompt('Reason for ignoring (required):');
                                    if (reason === null) return;
                                    if (!reason.trim()) {
                                      useNotificationStore.getState().addToast({ variant: 'warning', title: 'Reason required' });
                                      return;
                                    }
                                    updateFindingStatus(f.id, 'ignored');
                                    useNotificationStore.getState().addToast({ variant: 'info', title: 'Ignored', description: reason.slice(0, 80) });
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-medium text-[#7A7F93] hover:bg-[#070709] hover:text-[#E6E8F0] hover:border-[#2E2E36] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)]"
                                  style={{ border: '1px solid #232329' }}
                                >
                                  Ignore
                                </button>
                                <span className="flex h-7 w-7 items-center justify-center bg-[#070709] text-[#7A7F93] group-hover:bg-[#1E1E24] group-hover:text-[#E6E8F0] group-hover:border-[#2E2E36] transition-colors" style={{ border: '1px solid #232329' }}>
                                  ›
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <FindingDetailDrawer finding={detailFinding} onClose={() => setDetailFinding(null)} />
    </div>
  );
}
