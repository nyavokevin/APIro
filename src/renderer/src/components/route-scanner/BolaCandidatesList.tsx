import { useState } from 'react';
import { Shield, Scale, AlertTriangle, ExternalLink, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import type { ScannedRoute } from '@shared/types/scanner';
import { findBolaCandidates, MUTATING_METHODS } from '../../lib/scanner/bolaCandidate';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useRequestStore } from '../../stores/requestStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useUiStore } from '../../stores/uiStore';
import { METHOD_COLORS } from '@shared/constants/methods';
import type { RequestData } from '@shared/types/request';
import { uid } from '../../lib/id';

function methodColor(m: string): string {
  return (METHOD_COLORS as Record<string, string>)[m as keyof typeof METHOD_COLORS] ?? '#9FA3B5';
}

function routeToRequest(route: ScannedRoute, baseUrl: string): RequestData {
  const url = (() => {
    const base = baseUrl.replace(/\/$/, '');
    const path = route.path.startsWith('/') ? route.path : `/${route.path}`;
    // Replace {id} / :id placeholders with example
    const filled = path.replace(/\{[^}]+\}/g, '123').replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '123');
    return `${base}${filled}`;
  })();
  const headers = route.authRequired ? [{ id: uid(), key: 'Authorization', value: 'Bearer {{authToken}}', enabled: true }] : [];
  const params = route.params
    .filter((p) => p.location !== 'path')
    .map((p) => ({ id: uid(), key: p.name, value: p.name.toLowerCase().includes('id') ? '123' : 'example', enabled: true }));
  return {
    id: uid(),
    name: `${route.method} ${route.path}`,
    method: route.method as RequestData['method'],
    url,
    headers,
    params,
    bodyType: ['POST', 'PUT', 'PATCH'].includes(route.method) ? 'json' : 'none',
    body: ['POST', 'PUT', 'PATCH'].includes(route.method) ? '{\n  "id": 123\n}' : '',
    auth: { type: 'none' },
  };
}

interface Props {
  routes: ScannedRoute[];
  baseUrl: string;
}

export function BolaCandidatesList({ routes, baseUrl }: Props) {
  const candidates = findBolaCandidates(routes);
  const [expanded, setExpanded] = useState(true);
  const [confirmRoute, setConfirmRoute] = useState<ScannedRoute | null>(null);
  const [pendingRoute, setPendingRoute] = useState<ScannedRoute | null>(null);

  if (candidates.length === 0) return null;

  const handleTestClick = (route: ScannedRoute) => {
    const isMutating = MUTATING_METHODS.has(route.method.toUpperCase());
    if (isMutating) {
      setConfirmRoute(route);
      setPendingRoute(route);
    } else {
      doTest(route);
    }
  };

  const doTest = (route: ScannedRoute) => {
    const req = routeToRequest(route, baseUrl);
    // Import to workspace if not already there
    const existing = useRequestStore.getState().tabs.find((t) => t.request.method === req.method && t.request.url === req.url);
    let targetId: string;
    if (existing) {
      targetId = existing.id;
      useRequestStore.getState().setActiveTab(existing.id);
    } else {
      targetId = useRequestStore.getState().openRequest(req);
    }
    useUiStore.getState().setActivePage('workspace');
    // Dispatch to open AuthMatrixModal pre-filled — SecurityTab listens for this event
    // We also directly show a toast
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('apiforge:open-workspace-security', { detail: { requestId: targetId } }));
      // Also try to trigger BOLA modal via custom event for direct opening
      window.dispatchEvent(new CustomEvent('apiforge:open-bola-test', { detail: { request: req } }));
    }, 100);
    useNotificationStore.getState().addToast({
      variant: 'info',
      title: `BOLA candidate opened`,
      description: `${route.method} ${route.path} → Workspace`,
    });
    setConfirmRoute(null);
    setPendingRoute(null);
  };

  return (
    <>
      <div className="overflow-hidden animate-fadeUp" style={{ background: '#0E0E10', border: '1px solid #232329', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
        <div
          className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer select-none"
          style={{ background: 'rgba(249,115,22,0.08)', borderBottom: '1px solid rgba(249,115,22,0.18)' }}
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center" style={{ background: 'rgba(249,115,22,0.14)', border: '1px solid rgba(249,115,22,0.28)', color: '#F97316' }}>
              <Scale size={13} />
            </span>
            <span className="text-sm font-semibold" style={{ color: '#E6E8F0' }}>
              {candidates.length} BOLA candidates
            </span>
            <span className="hidden sm:inline text-xs" style={{ color: '#9FA3B5' }}>
              auth + resource ID in path
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)', color: '#EF4444' }}>
              <Shield size={9} /> IDOR
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs" style={{ color: '#7A7F93' }}>{candidates.filter(c=>c.risk==='high').length} high · {candidates.filter(c=>c.risk==='medium').length} med</span>
            {expanded ? <ChevronUp size={14} style={{ color: '#9FA3B5' }} /> : <ChevronDown size={14} style={{ color: '#9FA3B5' }} />}
          </div>
        </div>

        {expanded && (
          <div className="p-2 space-y-1.5 max-h-[320px] overflow-auto">
            <p className="px-1 py-1 text-xs leading-relaxed" style={{ color: '#9FA3B5' }}>
              Routes with <span style={{ color: '#E6E8F0' }}>auth + path ID</span> are classic IDOR/BOLA targets. <span style={{ color: '#F97316' }}>Mutating methods</span> (DELETE/PUT/PATCH/POST) will ask confirmation before testing.
            </p>
            {candidates.map((r) => (
              <div key={`${r.method}:${r.path}:${r.file}:${r.line}`} className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[#121215] group" style={{ background: '#070709', border: '1px solid #232329', borderLeft: r.risk === 'high' ? '2px solid #EF4444' : r.risk === 'medium' ? '2px solid #F97316' : '2px solid #232329' }}>
                <span className="w-[56px] shrink-0 text-center font-mono text-[11px] font-bold tracking-wide px-1 py-1" style={{ background: '#121215', border: '1px solid #232329', color: methodColor(r.method) }}>{r.method}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium" style={{ color: '#E6E8F0' }} title={r.path}>{r.path}</span>
                <span className="hidden lg:block max-w-[140px] truncate text-xs" style={{ color: '#7A7F93' }} title={r.handler}>{r.handler}</span>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium" style={{ background: r.authRequired ? 'rgba(16,185,129,0.10)' : '#121215', border: '1px solid rgba(16,185,129,0.18)', color: r.authRequired ? '#10B981' : '#7A7F93' }}>
                  <Lock size={9} /> {r.authRequired ? 'auth' : 'no-auth'}
                </span>
                <span className={`hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-bold uppercase`} style={{ background: r.risk==='high' ? 'rgba(239,68,68,0.12)' : r.risk==='medium' ? 'rgba(249,115,22,0.12)' : 'rgba(148,163,184,0.08)', border: `1px solid ${r.risk==='high' ? 'rgba(239,68,68,0.22)' : r.risk==='medium' ? 'rgba(249,115,22,0.22)' : '#232329'}`, color: r.risk==='high' ? '#EF4444' : r.risk==='medium' ? '#F97316' : '#9FA3B5' }}>{r.risk}</span>
                <Button variant={r.risk==='high' ? 'danger' : 'secondary'} size="sm" onClick={() => handleTestClick(r)} className="shrink-0 active:scale-[0.97] ml-auto">
                  <Scale size={11} /> Test BOLA
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="text-[11px]" style={{ color: '#5A5E6E' }}>{candidates.length} candidates · {candidates.filter(c=>MUTATING_METHODS.has(c.method)).length} mutating</span>
              <button onClick={() => { useUiStore.getState().setActivePage('security'); }} className="text-xs inline-flex items-center gap-1 hover:underline" style={{ color: '#8B5CF6' }}>
                Open Security <ExternalLink size={11} />
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!confirmRoute}
        onClose={() => { setConfirmRoute(null); setPendingRoute(null); }}
        title={`Test ${pendingRoute?.method} ${pendingRoute?.path}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setConfirmRoute(null); setPendingRoute(null); }}>Cancel</Button>
            <Button variant="danger" onClick={() => pendingRoute && doTest(pendingRoute)}>
              <AlertTriangle size={13} /> Continue — mutating request
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#FCA5A5' }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#EF4444' }}>Mutating method — confirmation required</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: '#9FA3B5' }}>
                <span className="font-mono font-bold" style={{ color: '#E6E8F0' }}>{pendingRoute?.method} {pendingRoute?.path}</span> will send a real <span style={{ color: '#EF4444' }}>{pendingRoute?.method}</span> request to <span className="font-mono" style={{ color: '#E6E8F0' }}>{baseUrl}</span>. This can modify or delete data. Only test against non-production or with explicit permission.
              </p>
            </div>
          </div>
          <p className="text-xs" style={{ color: '#7A7F93' }}>Tip: switch environment to <span style={{ color: '#E6E8F0' }}>Local</span> for safe testing. The request will be opened in Workspace with <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>Authorization: Bearer &#123;&#123;authToken&#125;&#125;</code> pre-filled.</p>
        </div>
      </Modal>
    </>
  );
}
