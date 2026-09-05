import { useState, useMemo } from 'react';
import { Shield, Search, Scale, ExternalLink, X, AlertTriangle, Info, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import type { RequestData, ResponseData } from '@shared/types/request';
import { useSecurityStore, type SecurityFinding, type SecuritySeverity } from '../../stores/securityStore';
import { useUiStore } from '../../stores/uiStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

function isProdEnv(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  return n.includes('prod') || n.includes('live') || n === 'production';
}
function isSensitiveEnv(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  if (n === 'local' || n === 'dev' || n === 'development') return false;
  return true;
}

interface SecurityTabProps {
  request: RequestData;
  response: ResponseData | null;
  requestId: string;
}

const SEVERITY_META: Record<SecuritySeverity, { label: string; color: string; bg: string; dot: string; icon: string }> = {
  critical: { label: 'Critical', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', dot: '#EF4444', icon: '🔴' },
  high: { label: 'High', color: '#F97316', bg: 'rgba(249,115,22,0.12)', dot: '#F97316', icon: '🟠' },
  medium: { label: 'Medium', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', dot: '#F59E0B', icon: '🟡' },
  low: { label: 'Low', color: '#8F909E', bg: 'rgba(143,144,158,0.12)', dot: '#8F909E', icon: '🔵' },
  info: { label: 'Info', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', dot: '#60A5FA', icon: 'ℹ️' },
};

function SeverityBadge({ severity }: { severity: SecuritySeverity }) {
  const m = SEVERITY_META[severity];
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-xs font-semibold"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}33`, padding: '2px 6px', borderRadius: '0px', fontSize: '11px' }}
    >
      <span style={{ width: '7px', height: '7px', borderRadius: '9999px', background: m.dot, display: 'inline-block' }} />
      {m.label}
    </span>
  );
}

// ── Auth Matrix / BOLA modal ───────────────────────────────────────────────
function AuthMatrixModal({
  open,
  onClose,
  request,
}: {
  open: boolean;
  onClose: () => void;
  request: RequestData;
}) {
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [results, setResults] = useState<null | { a: { status: number; body: string }; b: { status: number; body: string } }>(null);
  const [loading, setLoading] = useState(false);
  const url = request.url || 'https://api.example.com/users/{{id}}';
  const method = request.method;
  const activeEnvNameModal = useEnvironmentStore((s) => s.environments.find((e) => e.id === s.activeId)?.name ?? null);
  const isProdModal = isProdEnv(activeEnvNameModal);

  const runTest = async () => {
    if (!request.url) {
      useNotificationStore.getState().addToast({ variant: 'warning', title: 'URL manquante', description: 'Renseigne une URL avant de tester.' });
      return;
    }
    setLoading(true);
    try {
      // Build fetch headers from request
      const buildHeaders = (token: string) => {
        const h: Record<string, string> = {};
        for (const kv of request.headers) if (kv.enabled && kv.key) h[kv.key] = kv.value;
        if (token) h['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
        return h;
      };
      // Use window.fetch directly for BOLA repro — compare two identities side-by-side
      const doFetch = async (token: string) => {
        try {
          const res = await fetch(url, { method, headers: buildHeaders(token) });
          const text = await res.text();
          return { status: res.status, body: text.slice(0, 2000) };
        } catch (e) {
          return { status: 0, body: e instanceof Error ? e.message : String(e) };
        }
      };
      const [a, b] = await Promise.all([doFetch(tokenA), doFetch(tokenB)]);
      setResults({ a, b });
      const bolaSuspected = a.status < 400 && b.status < 400 && a.body === b.body && a.status !== 401 && a.status !== 403;
      useNotificationStore.getState().addToast({
        variant: bolaSuspected ? 'warning' : 'info',
        title: bolaSuspected ? 'BOLA suspecté — même réponse pour deux identités' : 'Test BOLA exécuté',
        description: `Identity A: ${a.status} · Identity B: ${b.status}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Test authorization (BOLA / IDOR)"
      className="!max-w-[640px]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="primary" onClick={runTest} disabled={loading}>
            <Scale size={14} /> {loading ? 'Testing…' : 'Run BOLA test'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isProdModal && (
          <div className="flex items-start gap-2 rounded p-2.5 text-xs" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span><strong>Production:</strong> {activeEnvNameModal} — real requests will be sent.</span>
          </div>
        )}
        <div className="bg-[#0A0A0A] p-3" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
          <div className="font-mono text-xs text-[#8F909E]">Requête pré-remplie</div>
          <div className="mt-1 flex items-center gap-2 font-mono text-sm text-[#E2E8F0]">
            <span className="font-semibold" style={{ color: '#8B5CF6' }}>{method}</span>
            <span className="truncate">{url}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${method} ${url}`);
                useNotificationStore.getState().addToast({ variant: 'success', title: 'Copié', description: `${method} ${url}` });
              }}
              className="ml-auto p-1 text-[#8F909E] hover:text-[#E2E8F0]"
              title="Copier"
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#8F909E]">
            Envoie la même requête avec deux identités différentes. Si les deux obtiennent 200 avec le même body, BOLA/IDOR est probable.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#8F909E]">Identity A — token (owner)</span>
            <input
              value={tokenA}
              onChange={(e) => setTokenA(e.target.value)}
              placeholder="Bearer eyJ… (ou token brut)"
              className="w-full bg-[#121212] px-3 text-sm text-[#E2E8F0] placeholder:text-[#8F909E] outline-none"
              style={{ border: '1px solid #262626', borderRadius: '0px', height: '40px' }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#8F909E]">Identity B — token (attacker)</span>
            <input
              value={tokenB}
              onChange={(e) => setTokenB(e.target.value)}
              placeholder="Bearer eyJ…"
              className="w-full bg-[#121212] px-3 text-sm text-[#E2E8F0] placeholder:text-[#8F909E] outline-none"
              style={{ border: '1px solid #262626', borderRadius: '0px', height: '40px' }}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // Quick fill from current auth config + environment
              const bearer = (request.auth as unknown as { bearer?: { token?: string } })?.bearer?.token ?? '';
              if (bearer) setTokenA(bearer);
              else useNotificationStore.getState().addToast({ variant: 'info', title: 'Aucun token trouvé', description: 'Configure Bearer dans Auth ou colle un token.' });
            }}
          >
            Use request auth → A
          </Button>
          <span className="text-xs text-[#8F909E] self-center">Astuce : colle deux JWT de deux utilisateurs différents.</span>
        </div>

        {results && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {([
              ['Identity A', results.a],
              ['Identity B', results.b],
            ] as const).map(([label, r]) => (
              <div key={label} className="bg-[#000000] p-3" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#E2E8F0]">{label}</span>
                  <span
                    className="font-mono text-xs font-semibold"
                    style={{
                      padding: '2px 6px',
                      background: r.status >= 200 && r.status < 300 ? 'rgba(16,185,129,0.12)' : r.status === 0 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                      color: r.status >= 200 && r.status < 300 ? '#10B981' : r.status === 0 ? '#EF4444' : '#F59E0B',
                      border: '1px solid #262626',
                    }}
                  >
                    {r.status || 'ERR'}
                  </span>
                </div>
                <pre className="mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap break-all bg-[#121212] p-2 font-mono text-xs text-[#E2E8F0]" style={{ border: '1px solid #262626' }}>
                  {r.body || '(empty)'}
                </pre>
              </div>
            ))}
          </div>
        )}

        {results && results.a.status === results.b.status && results.a.body === results.b.body && results.a.status < 400 && (
          <div className="flex items-start gap-2 p-3 text-xs" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Possible BOLA/IDOR :</strong> les deux identités reçoivent la même réponse 2xx avec le même body. Vérifie que l’API vérifie l’ownership côté serveur.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Finding row ──────────────────────────────────────────────────────────────
function FindingRow({ finding, onDismiss }: { finding: SecurityFinding; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[finding.severity];
  return (
    <div className="bg-[#121212] hover:bg-[#1A1A1A]" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span
          className="mt-0.5 h-2 w-2 shrink-0"
          style={{ background: meta.dot, borderRadius: '9999px', display: 'inline-block' }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-[#E2E8F0]" style={{ fontSize: '13px' }}>
              {finding.title}
            </span>
            <SeverityBadge severity={finding.severity} />
          </div>
          <div className="mt-0.5 truncate text-xs text-[#8F909E]">{finding.description}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#8F909E] hover:text-[#E2E8F0] hover:bg-[#262626]"
            style={{ border: '1px solid #262626', borderRadius: '0px' }}
            aria-expanded={open}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Détails
          </button>
          <button
            onClick={() => onDismiss(finding.id)}
            title="Dismiss"
            className="p-1 text-[#8F909E] hover:text-[#E2E8F0]"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-2 px-3 pb-3" style={{ borderTop: '1px solid #262626', paddingTop: '8px' }}>
          <div className="text-xs leading-relaxed text-[#8F909E]">
            <span className="font-semibold text-[#E2E8F0]">Règle:</span> {finding.ruleId} · {finding.category}
          </div>
          {finding.evidence && (
            <div>
              <div className="text-xs font-semibold text-[#8F909E]">Evidence</div>
              <pre className="mt-1 max-h-[120px] overflow-auto whitespace-pre-wrap break-all bg-[#000000] p-2 font-mono text-xs text-[#E2E8F0]" style={{ border: '1px solid #262626' }}>
                {finding.evidence}
              </pre>
            </div>
          )}
          {finding.remediation && (
            <div className="flex items-start gap-1.5 text-xs leading-relaxed" style={{ color: '#A5B4FC', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.20)', padding: '6px 8px' }}>
              <Info size={12} className="mt-0.5 shrink-0" />
              <span><strong>Fix:</strong> {finding.remediation}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main SecurityTab ───────────────────────────────────────────────────────
export function SecurityTab({ request, response, requestId }: SecurityTabProps) {
  const findings = useSecurityStore((s) => s.getFindingsForRequest(requestId));
  const runPassiveScanForRequest = useSecurityStore((s) => s.runPassiveScanForRequest);
  const dismissFinding = useSecurityStore((s) => s.dismissFinding);
  const setSelectedRequestId = useSecurityStore((s) => s.setSelectedRequestId);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const [bolaOpen, setBolaOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const activeEnvName = useEnvironmentStore((s) => s.environments.find((e) => e.id === s.activeId)?.name ?? null);
  const isProd = useMemo(() => isProdEnv(activeEnvName), [activeEnvName]);
  const isSensitive = useMemo(() => isSensitiveEnv(activeEnvName), [activeEnvName]);
  const [confirmBolaOpen, setConfirmBolaOpen] = useState(false);

  const doPassiveScan = () => {
    if (!response) {
      useNotificationStore.getState().addToast({ variant: 'info', title: 'Aucune réponse', description: 'Envoie la requête d’abord, puis relance le scan.' });
      return;
    }
    if (isSensitive && activeEnvName) {
      useNotificationStore.getState().addToast({
        variant: isProd ? 'warning' : 'info',
        title: isProd ? `Scanning ${activeEnvName}` : `Environment: ${activeEnvName}`,
        description: isProd ? 'Heads-up: you are on Production — passive scan is read-only, but follow-up active tests will hit live.' : 'Passive scan is read-only.',
      });
    }
    setScanning(true);
    window.setTimeout(() => {
      const fresh = runPassiveScanForRequest(request, response);
      setScanning(false);
      if (fresh.length === 0) {
        useNotificationStore.getState().addToast({ variant: 'success', title: 'Aucun problème détecté', description: 'Le scan passif n’a trouvé aucune anomalie.' });
      } else {
        useNotificationStore.getState().addToast({
          variant: fresh.some((f) => f.severity === 'critical' || f.severity === 'high') ? 'warning' : 'info',
          title: `${fresh.length} finding(s)`,
          description: fresh.slice(0, 2).map((f) => f.title).join(' · '),
        });
      }
    }, 180);
  };

  const handleScan = () => {
    doPassiveScan();
  };

  const handleBolaClick = () => {
    if (isProd) {
      setConfirmBolaOpen(true);
      return;
    }
    if (isSensitive && activeEnvName) {
      useNotificationStore.getState().addToast({ variant: 'warning', title: `Testing against ${activeEnvName}`, description: 'BOLA will send real requests to this environment.' });
    }
    setBolaOpen(true);
  };

  const handleOpenFull = () => {
    setSelectedRequestId(requestId);
    setActivePage('security');
  };

  return (
    <div className="flex h-full flex-col p-3">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center bg-[rgba(139,92,246,0.12)] text-[#8B5CF6]" style={{ border: '1px solid rgba(139,92,246,0.25)', borderRadius: '0px' }}>
          <Shield size={14} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#E2E8F0]">Security — this request</span>
            {findings.length > 0 && (
              <span
                className="inline-flex items-center justify-center text-xs font-semibold"
                style={{
                  minWidth: '20px',
                  height: '18px',
                  padding: '0 6px',
                  borderRadius: '9999px',
                  background: findings.some((f) => f.severity === 'critical' || f.severity === 'high') ? '#EF4444' : '#8B5CF6',
                  color: '#FFFFFF',
                }}
              >
                {findings.length}
              </span>
            )}
          </div>
          <div className="truncate font-mono text-xs text-[#8F909E]">
            {request.method} {request.url || '(no URL)'}
          </div>
        </div>
      </div>

      {isProd && (
        <div className="mb-3 flex items-start gap-2 rounded p-2.5 text-xs" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Production — {activeEnvName}</span>
            <span className="ml-1 text-[#8F909E]">Passive scan is read-only, but </span>
            <span className="font-semibold text-[#FCA5A5]">BOLA will send real requests</span>
            <span className="text-[#8F909E]"> to live API.</span>
          </div>
        </div>
      )}
      {!isProd && isSensitive && activeEnvName && (
        <div className="mb-3 flex items-center gap-2 rounded px-2.5 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#FCD34D' }}>
          <AlertTriangle size={12} className="shrink-0" />
          <span>Environment <strong>{activeEnvName}</strong> — not Local.</span>
        </div>
      )}

      {/* Findings list */}
      <div className="min-h-0 flex-1 overflow-auto">
        {findings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center" style={{ border: '1px dashed #262626', background: '#0A0A0A' }}>
            <Shield size={20} className="text-[#8F909E]" strokeWidth={1.5} />
            <p className="text-sm font-medium text-[#E2E8F0]">No issues for this request</p>
            <p className="max-w-[320px] text-xs leading-relaxed text-[#8F909E]">
              Run a passive scan on the last response to check security headers, cookies, CORS and exposures.
            </p>
            {!response && <p className="text-xs text-[#8F909E]">Send the request first to enable scanning.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            {findings
              .slice()
              .sort((a, b) => {
                const order: Record<SecuritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
                return order[a.severity] - order[b.severity];
              })
              .map((f) => (
                <FindingRow key={f.id} finding={f} onDismiss={dismissFinding} />
              ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #262626', paddingTop: '12px' }}>
        <Button variant="secondary" size="sm" onClick={handleScan} disabled={scanning}>
          <Search size={14} /> {scanning ? 'Scanning…' : 'Run passive scan'}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleBolaClick} title={isProd ? `Will test against ${activeEnvName} — confirmation required` : undefined}>
          <Scale size={14} /> Test authorization (BOLA)
        </Button>
        <Button variant="ghost" size="sm" onClick={handleOpenFull} className="ml-auto">
          <ExternalLink size={14} /> Open full Security page
        </Button>
      </div>

      <AuthMatrixModal open={bolaOpen} onClose={() => setBolaOpen(false)} request={request} />

      <Modal
        open={confirmBolaOpen}
        onClose={() => setConfirmBolaOpen(false)}
        title={`Test BOLA against ${activeEnvName}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBolaOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { setConfirmBolaOpen(false); setBolaOpen(true); }}>
              Continue — hit {activeEnvName}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded p-3" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">This will send real requests to <span className="underline">{activeEnvName}</span></p>
              <p className="text-xs leading-relaxed text-[#8F909E]">BOLA/IDOR test fires two live requests with different identities and compares responses. Only run against production if you have explicit permission.</p>
            </div>
          </div>
          <p className="text-xs text-[#8F909E]">Tip: switch to <span className="text-[#E2E8F0]">Local</span> for safe testing.</p>
        </div>
      </Modal>
    </div>
  );
}
