import { useMemo, useState } from 'react';
import { Shield, Search, Trash2, Filter, ArrowLeft, Copy, ExternalLink, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useSecurityStore, type SecuritySeverity, type SecurityFinding } from '../stores/securityStore';
import { useUiStore } from '../stores/uiStore';
import { useRequestStore } from '../stores/requestStore';
import { Button } from '../components/ui/Button';
import { useNotificationStore } from '../stores/notificationStore';

const SEVERITY_ORDER: Record<SecuritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEVERITY_COLOR: Record<SecuritySeverity, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#8F909E',
  info: '#60A5FA',
};

function SeverityPill({ severity }: { severity: SecuritySeverity }) {
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-xs font-semibold"
      style={{
        color: SEVERITY_COLOR[severity],
        background: `${SEVERITY_COLOR[severity]}1A`,
        border: `1px solid ${SEVERITY_COLOR[severity]}33`,
        padding: '2px 6px',
        borderRadius: '0px',
        fontSize: '11px',
      }}
    >
      <span style={{ width: '7px', height: '7px', borderRadius: '9999px', background: SEVERITY_COLOR[severity], display: 'inline-block' }} />
      {severity.toUpperCase()}
    </span>
  );
}

export function SecurityPage() {
  const findings = useSecurityStore((s) => s.findings);
  const selectedRequestId = useSecurityStore((s) => s.selectedRequestId);
  const setSelectedRequestId = useSecurityStore((s) => s.setSelectedRequestId);
  const dismissFinding = useSecurityStore((s) => s.dismissFinding);
  const clearForRequest = useSecurityStore((s) => s.clearForRequest);
  const clearAll = useSecurityStore((s) => s.clearAll);
  const runPassiveScanForRequest = useSecurityStore((s) => s.runPassiveScanForRequest);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const tabs = useRequestStore((s) => s.tabs);

  const [severityFilter, setSeverityFilter] = useState<SecuritySeverity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const requestNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tabs) m.set(t.id, `${t.request.method} ${t.request.url || t.request.name}`);
    return m;
  }, [tabs]);

  const filtered = useMemo(() => {
    let list = findings.filter((f) => !f.dismissed);
    if (selectedRequestId) list = list.filter((f) => f.requestId === selectedRequestId);
    if (severityFilter !== 'all') list = list.filter((f) => f.severity === severityFilter);
    if (categoryFilter !== 'all') list = list.filter((f) => f.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.ruleId.toLowerCase().includes(q));
    }
    return list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.timestamp - a.timestamp);
  }, [findings, selectedRequestId, severityFilter, categoryFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, SecurityFinding[]>();
    for (const f of filtered) {
      const arr = map.get(f.requestId) ?? [];
      arr.push(f);
      map.set(f.requestId, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const totalActive = findings.filter((f) => !f.dismissed).length;
  const scopedLabel = selectedRequestId ? requestNameMap.get(selectedRequestId) ?? selectedRequestId : null;

  const handleScanSelected = () => {
    if (!selectedRequestId) {
      // scan all tabs with responses
      let count = 0;
      for (const t of tabs) {
        if (t.response) {
          const fresh = runPassiveScanForRequest(t.request, t.response);
          count += fresh.length;
        }
      }
      useNotificationStore.getState().addToast({ variant: count ? 'warning' : 'success', title: count ? `${count} findings` : 'No issues', description: count ? 'Scanned all requests' : 'All clear' });
      return;
    }
    const tab = tabs.find((t) => t.id === selectedRequestId);
    if (!tab?.response) {
      useNotificationStore.getState().addToast({ variant: 'info', title: 'No response to scan', description: 'Send the request first.' });
      return;
    }
    const fresh = runPassiveScanForRequest(tab.request, tab.response);
    useNotificationStore.getState().addToast({ variant: fresh.length ? 'warning' : 'success', title: fresh.length ? `${fresh.length} findings` : 'No issues', description: fresh.slice(0, 2).map(f=>f.title).join(' · ') || 'Passive scan passed' });
  };

  const handleScanAll = () => {
    let count = 0;
    for (const t of tabs) {
      if (t.response) count += runPassiveScanForRequest(t.request, t.response).length;
    }
    useNotificationStore.getState().addToast({ variant: count ? 'warning' : 'success', title: count ? `${count} total findings` : 'No issues', description: 'Scanned all responses' });
  };

  return (
    <div className="flex h-full flex-col bg-[#000000] overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 bg-[#000000] shrink-0" style={{ padding: '20px 32px', borderBottom: '1px solid #262626' }}>
        <span className="flex h-9 w-9 items-center justify-center bg-[rgba(139,92,246,0.12)] text-[#8B5CF6]" style={{ border: '1px solid rgba(139,92,246,0.25)', borderRadius: '0px' }}>
          <Shield size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-[#E2E8F0]" style={{ fontSize: '16px' }}>Security</h1>
            <span className="text-xs text-[#8F909E]">{totalActive} active finding(s)</span>
            {selectedRequestId && (
              <span className="inline-flex items-center gap-1 bg-[#121212] px-2 py-1 font-mono text-xs text-[#E2E8F0]" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
                <Filter size={10} /> Filtered: <span className="max-w-[260px] truncate">{scopedLabel}</span>
                <button onClick={() => setSelectedRequestId(null)} className="ml-1 text-[#8F909E] hover:text-[#E2E8F0]" title="Clear filter">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#8F909E]">Passive analysis of request/response pairs — headers, cookies, CORS, exposures, BOLA hints.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setActivePage('workspace')}>
            <ArrowLeft size={14} /> Back to Workspace
          </Button>
          <Button variant="secondary" size="sm" onClick={handleScanAll}>
            <Search size={14} /> Scan all
          </Button>
          {selectedRequestId && (
            <Button variant="secondary" size="sm" onClick={handleScanSelected}>
              <Search size={14} /> Scan this request
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => { if (selectedRequestId) clearForRequest(selectedRequestId); else clearAll(); }}>
            <Trash2 size={14} /> Clear {selectedRequestId ? 'filtered' : 'all'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 bg-[#0A0A0A] px-8 py-3 shrink-0" style={{ borderBottom: '1px solid #262626' }}>
        <div className="flex items-center gap-1 text-xs text-[#8F909E]">
          <Filter size={12} /> Filters:
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as never)}
          className="bg-[#121212] px-2 py-1 text-xs text-[#E2E8F0] outline-none"
          style={{ border: '1px solid #262626', borderRadius: '0px', height: '32px' }}
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
          className="bg-[#121212] px-2 py-1 text-xs text-[#E2E8F0] outline-none"
          style={{ border: '1px solid #262626', borderRadius: '0px', height: '32px' }}
        >
          <option value="all">All categories</option>
          <option value="headers">Headers</option>
          <option value="auth">Auth / CORS</option>
          <option value="transport">Transport</option>
          <option value="exposure">Exposure</option>
          <option value="injection">Injection</option>
        </select>
        <div className="relative ml-2">
          <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#8F909E]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search findings…"
            className="w-[220px] bg-[#121212] pl-7 pr-2 text-xs text-[#E2E8F0] placeholder:text-[#8F909E] outline-none"
            style={{ border: '1px solid #262626', borderRadius: '0px', height: '32px' }}
          />
        </div>
        {selectedRequestId && (
          <button
            onClick={() => {
              const tab = tabs.find((t) => t.id === selectedRequestId);
              if (tab) {
                useRequestStore.getState().setActiveTab(tab.id);
                useUiStore.getState().setActivePage('workspace');
              }
            }}
            className="ml-auto inline-flex items-center gap-1 text-xs text-[#8B5CF6] hover:underline"
          >
            <ExternalLink size={12} /> Open request in Workspace
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" style={{ padding: '24px 32px' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" style={{ border: '1px dashed #262626', background: '#0A0A0A' }}>
            {totalActive === 0 ? (
              <>
                <CheckCircle2 size={28} className="text-[#10B981]" strokeWidth={1.6} />
                <p className="text-sm font-medium text-[#E2E8F0]">No security findings</p>
                <p className="max-w-[420px] text-xs leading-relaxed text-[#8F909E]">
                  Send requests in Workspace, then open the Security tab or click Scan. Passive checks cover CSP, HSTS, X-Frame-Options, cookies, CORS, server leaks and BOLA hints.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={handleScanAll}>
                    <Search size={14} /> Run scan on all responses
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setActivePage('workspace')}>
                    Go to Workspace
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Shield size={24} className="text-[#8F909E]" />
                <p className="text-sm text-[#E2E8F0]">No findings match filters</p>
                <button onClick={() => { setSeverityFilter('all'); setCategoryFilter('all'); setSearch(''); }} className="text-xs text-[#8B5CF6] hover:underline">
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([reqId, list]) => {
              const label = requestNameMap.get(reqId) ?? reqId;
              const isSelected = selectedRequestId === reqId;
              return (
                <div key={reqId} className="bg-[#121212]" style={{ border: `1px solid ${isSelected ? '#8B5CF6' : '#262626'}`, borderRadius: '0px' }}>
                  <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid #262626', background: isSelected ? 'rgba(139,92,246,0.06)' : '#0A0A0A' }}>
                    <span className="font-mono text-xs font-semibold text-[#E2E8F0]">{label}</span>
                    <span className="text-xs text-[#8F909E]">· {list.length} finding(s)</span>
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(reqId);
                          useNotificationStore.getState().addToast({ variant: 'success', title: 'Copied', description: reqId });
                        }}
                        className="p-1 text-[#8F909E] hover:text-[#E2E8F0]"
                        title="Copy requestId"
                      >
                        <Copy size={12} />
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const tab = tabs.find((t) => t.id === reqId);
                          if (tab) {
                            if (tab.response) runPassiveScanForRequest(tab.request, tab.response);
                            else useNotificationStore.getState().addToast({ variant: 'info', title: 'No response', description: 'Send request first' });
                          }
                        }}
                      >
                        <Search size={12} /> Re-scan
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const tab = tabs.find((t) => t.id === reqId);
                          if (tab) {
                            useRequestStore.getState().setActiveTab(tab.id);
                            useUiStore.getState().setActivePage('workspace');
                          }
                        }}
                      >
                        Open
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => clearForRequest(reqId)}>
                        <Trash2 size={12} /> Clear
                      </Button>
                    </span>
                  </div>
                  <div className="divide-y divide-[#262626]">
                    {list.map((f) => (
                      <div key={f.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[#1A1A1A]">
                        <SeverityPill severity={f.severity} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#E2E8F0]">{f.title}</span>
                            <span className="font-mono text-xs text-[#8F909E]">{f.ruleId}</span>
                            <span className="text-xs capitalize text-[#8F909E]" style={{ background: '#0A0A0A', border: '1px solid #262626', padding: '1px 5px' }}>
                              {f.category}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-[#8F909E]">{f.description}</p>
                          {f.evidence && (
                            <pre className="mt-2 max-h-[100px] overflow-auto whitespace-pre-wrap break-all bg-[#000000] p-2 font-mono text-xs text-[#E2E8F0]" style={{ border: '1px solid #262626' }}>
                              {f.evidence}
                            </pre>
                          )}
                          {f.remediation && (
                            <div className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: '#A5B4FC', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.20)', padding: '6px 8px' }}>
                              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span><strong>Fix:</strong> {f.remediation}</span>
                            </div>
                          )}
                        </div>
                        <button onClick={() => dismissFinding(f.id)} className="shrink-0 p-1 text-[#8F909E] hover:text-[#E2E8F0]" title="Dismiss">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
