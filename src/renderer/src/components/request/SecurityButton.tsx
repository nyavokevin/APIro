import { useState } from 'react';
import { Shield, ScanSearch } from 'lucide-react';
import { useSecurityStore } from '../../stores/securityStore';
import { useRequestStore } from '../../stores/requestStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface SecurityButtonProps {
  requestId?: string;
  compact?: boolean;
}

function isProdEnvironment(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  if (n === 'local' || n === 'dev' || n === 'development' || n === 'test') return false;
  return n.includes('prod') || n === 'live' || n.includes('production') || n.includes('staging') && n.includes('prod');
}

function isSensitiveEnvironment(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  // Consider any non-local/dev as sensitive; prod is critical
  if (n === 'local' || n === 'dev' || n === 'development') return false;
  if (n.includes('prod') || n.includes('live') || n.includes('production')) return true;
  // staging/preview etc are also sensitive but less critical
  if (n.includes('staging') || n.includes('preview')) return true;
  // fallback: if not explicitly local/dev, treat as sensitive (better safe)
  return true;
}

export function SecurityButton({ requestId, compact = false }: SecurityButtonProps) {
  const count = useSecurityStore((s) =>
    requestId ? s.getFindingCountForRequest(requestId) : s.findings.filter((f) => !f.dismissed).length
  );
  const runPassiveScanForRequest = useSecurityStore((s) => s.runPassiveScanForRequest);
  const setSelectedRequestId = useSecurityStore((s) => s.setSelectedRequestId);
  const hasCritical = useSecurityStore((s) =>
    requestId
      ? s.findings.some((f) => f.requestId === requestId && !f.dismissed && (f.severity === 'critical' || f.severity === 'high'))
      : false
  );
  const activeEnvName = useEnvironmentStore((s) => {
    const active = s.environments.find((e) => e.id === s.activeId);
    return active?.name ?? null;
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const isProd = isProdEnvironment(activeEnvName);
  const isSensitive = isSensitiveEnvironment(activeEnvName);

  const doScanAndNavigate = () => {
    if (!requestId) {
      useNotificationStore.getState().addToast({
        variant: 'warning',
        title: 'No request selected',
        description: 'Open a request in Workspace first.',
      });
      return;
    }
    setSelectedRequestId(requestId);
    const tab = useRequestStore.getState().tabs.find((t) => t.id === requestId);
    if (!tab) {
      useNotificationStore.getState().addToast({ variant: 'error', title: 'Request not found' });
      return;
    }
    if (!tab.request.url?.trim()) {
      useNotificationStore.getState().addToast({ variant: 'warning', title: 'Missing URL', description: 'Enter a URL before scanning.' });
      return;
    }

    // Always show a scanning notification first
    useNotificationStore.getState().addToast({
      variant: 'info',
      title: 'Scanning…',
      description: `Analyzing ${tab.request.method} ${tab.request.url}`,
    });

    const runScan = (req: typeof tab.request, res: typeof tab.response) => {
      if (!res || res.statusCode === 0) {
        // Record empty scan so history shows the attempt
        const env = (() => {
          try {
            const { useEnvironmentStore } = require('../../stores/environmentStore');
            const st = useEnvironmentStore.getState();
            return st.environments.find((e: any) => e.id === st.activeId)?.name ?? null;
          } catch { return null; }
        })();
        useSecurityStore.getState().recordScan('passive', [req.id], [], env);
        useNotificationStore.getState().addToast({
          variant: 'info',
          title: 'No response to scan',
          description: 'Send the request first — recorded empty scan in history.',
        });
        // Stay in Workspace on the Security tab instead of jumping to full page
        window.dispatchEvent(new CustomEvent('apiforge:open-workspace-security', { detail: { requestId } }));
        return;
      }
      const fresh = runPassiveScanForRequest(req, res);
      if (fresh.length > 0) {
        useNotificationStore.getState().addToast({
          variant: fresh.some((f) => f.severity === 'critical' || f.severity === 'high') ? 'warning' : 'info',
          title: `${fresh.length} security finding(s)`,
          description: fresh.slice(0, 2).map((f) => f.title).join(' · '),
        });
      } else {
        useNotificationStore.getState().addToast({
          variant: 'success',
          title: 'No security issues detected',
          description: 'Passive scan passed with no findings.',
        });
      }
      // Stay in Workspace — open inline Security tab, don't redirect to full page
      window.dispatchEvent(new CustomEvent('apiforge:open-workspace-security', { detail: { requestId } }));
    };

    if (!tab.response || tab.response.statusCode === 0) {
      // Optionally auto-send then scan: for now just notify and show inline tab
      runScan(tab.request, tab.response);
    } else {
      runScan(tab.request, tab.response);
    }
  };

  const handleClick = () => {
    // Guard for sensitive env before any scan that may trigger active requests (BOLA etc handled in tab, but passive is safe; we still warn for consistency)
    if (isSensitive) {
      // For passive scan, we show a lighter warning but still confirm if prod
      if (isProd) {
        setPendingAction(() => doScanAndNavigate);
        setConfirmOpen(true);
        return;
      }
      // For staging etc, we still show a toast hint but don't block
      if (activeEnvName) {
        useNotificationStore.getState().addToast({
          variant: 'warning',
          title: `Scanning ${activeEnvName}`,
          description: 'Heads-up: active environment is not Local.',
        });
      }
    }
    doScanAndNavigate();
  };

  const confirmTitle = isProd ? `Scan against ${activeEnvName}?` : `Scanning ${activeEnvName}`;

  return (
    <>
      <button
        onClick={handleClick}
        title={isProd ? `Run security scan against ${activeEnvName} — this will analyze the last response` : count > 0 ? `${count} finding(s) — Run security scan` : 'Run security scan (passive) — checks headers/cookies/exposures on last response'}
        aria-label={`Run security scan ${count > 0 ? `(${count})` : ''}${isProd ? ' — production' : ''}`}
        className="relative inline-flex items-center justify-center gap-1.5 font-medium shrink-0"
        style={{
          background: hasCritical ? 'rgba(239,68,68,0.10)' : isProd ? 'rgba(239,68,68,0.06)' : '#0A0A0A',
          color: hasCritical ? '#EF4444' : isProd ? '#FCA5A5' : '#E2E8F0',
          border: `1px solid ${hasCritical ? 'rgba(239,68,68,0.40)' : isProd ? 'rgba(239,68,68,0.30)' : '#262626'}`,
          borderRadius: '0px',
          height: '40px',
          padding: compact ? '0 10px' : '0 14px',
          fontSize: '13px',
          lineHeight: '20px',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = hasCritical ? 'rgba(239,68,68,0.16)' : isProd ? 'rgba(239,68,68,0.10)' : '#1A1A1A';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = hasCritical ? 'rgba(239,68,68,0.10)' : isProd ? 'rgba(239,68,68,0.06)' : '#0A0A0A';
        }}
      >
        {isProd ? <ScanSearch size={16} strokeWidth={1.9} className="text-[#EF4444]" style={{ color: '#EF4444' }} /> : <Shield size={16} strokeWidth={1.9} className={hasCritical ? 'text-[#EF4444]' : 'text-[#8B5CF6]'} style={{ color: hasCritical ? '#EF4444' : '#8B5CF6' }} />}
        <span className="hidden sm:inline">{isProd ? 'Scan' : 'Scan'}</span>
        <span className="sm:hidden inline">Scan</span>
        {count > 0 && (
          <span
            className="inline-flex items-center justify-center font-semibold"
            style={{
              minWidth: '18px',
              height: '18px',
              padding: '0 5px',
              borderRadius: '9999px',
              background: hasCritical ? '#EF4444' : '#8B5CF6',
              color: '#FFFFFF',
              fontSize: '11px',
              lineHeight: '14px',
              marginLeft: '2px',
            }}
          >
            {count}
          </span>
        )}
      </button>

      <Modal
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setPendingAction(null);
        }}
        title={confirmTitle}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setConfirmOpen(false); setPendingAction(null); }}>Cancel</Button>
            <Button
              variant={isProd ? 'danger' : 'primary'}
              onClick={() => {
                const fn = pendingAction;
                setConfirmOpen(false);
                setPendingAction(null);
                fn?.();
              }}
            >
              {isProd ? 'Scan Production' : 'Continue'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded p-3" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
            <Shield size={16} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#FCA5A5]">You are scanning against <span className="underline">{activeEnvName}</span></p>
              <p className="text-xs leading-relaxed text-[#8F909E]">
                The passive scan itself is read-only (analyzes the last response), but follow-up tests in the Security tab (BOLA, rate-limit) will send <strong className="text-[#E2E8F0]">real requests</strong> to this environment. Continue only if this is intentional.
              </p>
            </div>
          </div>
          <p className="text-xs text-[#8F909E]">Tip: switch to <span className="text-[#E2E8F0]">Local</span> in the top-right environment selector for safe testing.</p>
        </div>
      </Modal>
    </>
  );
}
