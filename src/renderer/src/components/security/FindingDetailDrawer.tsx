import { X, Shield, AlertTriangle, Copy, ExternalLink, CheckCircle2, Clock3, FileCode2 } from 'lucide-react';
import type { SecurityFinding } from '../../stores/securityStore';
import { useRequestStore } from '../../stores/requestStore';
import { useUiStore } from '../../stores/uiStore';
import { useSecurityStore } from '../../stores/securityStore';
import { useNotificationStore } from '../../stores/notificationStore';

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#7A7F93',
  info: '#60A5FA',
};

export function FindingDetailDrawer({
  finding,
  onClose,
}: {
  finding: SecurityFinding | null;
  onClose: () => void;
}) {
  if (!finding) return null;
  const color = SEVERITY_COLOR[finding.severity] ?? '#7A7F93';
  const requestName = (() => {
    const tab = useRequestStore.getState().tabs.find((t) => t.id === finding.requestId);
    return tab ? `${tab.request.method} ${tab.request.url}` : finding.endpoint ?? finding.requestId;
  })();

  const handleOpenRequest = () => {
    const tab = useRequestStore.getState().tabs.find((t) => t.id === finding.requestId);
    if (tab) {
      useRequestStore.getState().setActiveTab(tab.id);
      useUiStore.getState().setActivePage('workspace');
      onClose();
    } else {
      useNotificationStore.getState().addToast({ variant: 'info', title: 'Request not open', description: 'Open it from History or Collections.' });
    }
  };

  const handleRetest = () => {
    const tab = useRequestStore.getState().tabs.find((t) => t.id === finding.requestId);
    if (!tab?.response) {
      useNotificationStore.getState().addToast({ variant: 'info', title: 'No response', description: 'Send the request first, then retest.' });
      return;
    }
    const fresh = useSecurityStore.getState().runPassiveScanForRequest(tab.request, tab.response);
    const still = fresh.find((f) => f.ruleId === finding.ruleId);
    if (still) {
      useNotificationStore.getState().addToast({ variant: 'warning', title: 'Still vulnerable', description: still.title });
    } else {
      useSecurityStore.getState().updateFindingStatus(finding.id, 'resolved');
      useNotificationStore.getState().addToast({ variant: 'success', title: 'Resolved', description: 'Finding no longer reproduced — marked as resolved.' });
      onClose();
    }
  };

  const handleResolve = () => {
    useSecurityStore.getState().updateFindingStatus(finding.id, 'resolved');
    useNotificationStore.getState().addToast({ variant: 'success', title: 'Marked as resolved' });
    onClose();
  };

  const handleIgnore = () => {
    const reason = window.prompt('Reason for ignoring (required):');
    if (reason === null) return;
    if (!reason.trim()) {
      useNotificationStore.getState().addToast({ variant: 'warning', title: 'Reason required', description: 'Provide a reason to ignore.' });
      return;
    }
    useSecurityStore.getState().updateFindingStatus(finding.id, 'ignored');
    useNotificationStore.getState().addToast({ variant: 'info', title: 'Ignored', description: reason.slice(0, 80) });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex" aria-modal="true" role="dialog">
      <div className="flex-1 bg-[#070709]/70 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="flex h-full w-full max-w-[580px] shrink-0 flex-col bg-[#0E0E10] shadow-[-16px_0_48px_rgba(0,0,0,0.5)] animate-fadeUp"
        style={{ borderLeft: '1px solid #232329' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #232329', background: '#121215' }}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex h-7 w-7 items-center justify-center shrink-0" style={{ background: `${color}14`, border: `1px solid ${color}30`, color }}>
                <Shield size={14} strokeWidth={1.8} />
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-widest tabular-nums"
                style={{ background: `${color}14`, color, border: `1px solid ${color}30`, letterSpacing: '0.06em' }}
              >
                <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: color }} />
                {finding.severity}
              </span>
              {finding.owasp && (
                <span className="rounded-none bg-[#070709] px-2 py-1 font-mono text-xs tabular-nums text-[#7A7F93]" style={{ border: '1px solid #232329' }}>
                  {finding.owasp}
                </span>
              )}
              <span className="rounded-none bg-[#070709] px-2 py-1 text-xs font-medium capitalize text-[#7A7F93]" style={{ border: '1px solid #232329' }}>
                {finding.category}
              </span>
              <span className="ml-1 inline-flex items-center gap-1 font-mono text-xs tabular-nums text-[#7A7F93]">
                <Clock3 size={11} /> {new Date(finding.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <h2 className="mt-2.5 text-[15px] font-semibold leading-tight tracking-tight text-[#E6E8F0]" style={{ letterSpacing: '-0.01em' }}>
              {finding.title}
            </h2>
            <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-[#7A7F93]">
              <FileCode2 size={11} /> {finding.ruleId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#070709] text-[#7A7F93] hover:bg-[#1E1E24] hover:text-[#E6E8F0] active:scale-[0.96] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)]"
            style={{ border: '1px solid #232329' }}
            aria-label="Close drawer"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div className="space-y-5">
            <section className="animate-fadeUp" style={{ animationDelay: '40ms' }}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#7A7F93]" style={{ letterSpacing: '0.08em' }}>
                Endpoint
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 bg-[#121215] px-3 py-2.5" style={{ border: '1px solid #232329' }}>
                <span className="font-mono text-sm font-semibold tabular-nums text-[#E6E8F0]">
                  {finding.method ?? ''} {finding.endpoint ?? requestName}
                </span>
                <button
                  onClick={handleOpenRequest}
                  className="ml-auto inline-flex items-center gap-1.5 bg-[#121215] px-2.5 py-1 text-xs font-medium text-[#8B5CF6] hover:bg-[#1E1E24] hover:text-[#7C3AED] active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)]"
                  style={{ border: '1px solid #232329' }}
                >
                  <ExternalLink size={12} /> Open in Workspace
                </button>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-[#7A7F93]">Click to open the request and inspect params / headers / body.</p>
            </section>

            <section className="animate-fadeUp" style={{ animationDelay: '80ms' }}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#7A7F93]" style={{ letterSpacing: '0.08em' }}>
                What happened
              </h3>
              <p
                className="mt-2 rounded-none p-3 text-sm leading-relaxed text-[#E6E8F0]"
                style={{ background: '#121215', border: '1px solid #232329', borderLeft: `2px solid ${color}` }}
              >
                {finding.description}
              </p>
              <p className="mt-2 font-mono text-xs tabular-nums text-[#7A7F93]">
                Detected {new Date(finding.timestamp).toLocaleString()} · Status:{' '}
                <span className="capitalize font-medium text-[#E6E8F0]">{finding.status ?? 'open'}</span>
              </p>
            </section>

            <section className="animate-fadeUp" style={{ animationDelay: '120ms' }}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#7A7F93]" style={{ letterSpacing: '0.08em' }}>
                Evidence
              </h3>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="bg-[#121215] p-3" style={{ border: '1px solid #232329' }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-tight text-[#E6E8F0]">Request</span>
                    {finding.evidenceRequest && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(finding.evidenceRequest!);
                          useNotificationStore.getState().addToast({ variant: 'success', title: 'Copied request' });
                        }}
                        className="flex h-6 w-6 items-center justify-center bg-[#070709] text-[#7A7F93] hover:bg-[#1E1E24] hover:text-[#E6E8F0] active:scale-[0.96] transition-all"
                        style={{ border: '1px solid #232329' }}
                        aria-label="Copy request"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                  <pre
                    className="max-h-[180px] overflow-auto whitespace-pre-wrap break-all bg-[#070709] p-2.5 font-mono text-xs leading-relaxed text-[#E6E8F0]"
                    style={{ border: '1px solid #232329' }}
                  >
                    {finding.evidenceRequest ?? finding.evidence ?? '(no request evidence)'}
                  </pre>
                </div>
                <div className="bg-[#121215] p-3" style={{ border: '1px solid #232329' }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-tight text-[#E6E8F0]">Response</span>
                    {finding.evidenceResponse && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(finding.evidenceResponse!);
                          useNotificationStore.getState().addToast({ variant: 'success', title: 'Copied response' });
                        }}
                        className="flex h-6 w-6 items-center justify-center bg-[#070709] text-[#7A7F93] hover:bg-[#1E1E24] hover:text-[#E6E8F0] active:scale-[0.96] transition-all"
                        style={{ border: '1px solid #232329' }}
                        aria-label="Copy response"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                  <pre
                    className="max-h-[180px] overflow-auto whitespace-pre-wrap break-all bg-[#070709] p-2.5 font-mono text-xs leading-relaxed text-[#E6E8F0]"
                    style={{ border: '1px solid #232329' }}
                  >
                    {finding.evidenceResponse ?? finding.evidence ?? '(no response evidence)'}
                  </pre>
                </div>
              </div>
              {!finding.evidence && !finding.evidenceRequest && !finding.evidenceResponse && (
                <p className="mt-2 text-xs italic leading-relaxed text-[#7A7F93]">No raw evidence captured — finding is based on header/body heuristics. Re-run the request to capture fresh evidence.</p>
              )}
            </section>

            <section className="animate-fadeUp" style={{ animationDelay: '160ms' }}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-[#7A7F93]" style={{ letterSpacing: '0.08em' }}>
                Why this matters
              </h3>
              <div
                className="mt-2 flex gap-2.5 p-3 text-sm leading-relaxed"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderLeft: '2px solid #EF4444', color: '#FCA5A5' }}
              >
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>{finding.whyMatters ?? (finding.severity === 'critical' || finding.severity === 'high' ? 'This can lead to data breach or privilege escalation if exploited in production.' : 'This weakens defense-in-depth and may be chained with other issues.')}</span>
              </div>
            </section>

            {finding.remediation && (
              <section className="animate-fadeUp" style={{ animationDelay: '200ms' }}>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-[#7A7F93]" style={{ letterSpacing: '0.08em' }}>
                  Recommended fix
                </h3>
                <div
                  className="mt-2 flex gap-2.5 p-3 text-sm leading-relaxed"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)', borderLeft: '2px solid #8B5CF6', color: '#C4B5FD' }}
                >
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  <span>{finding.remediation}</span>
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 shrink-0" style={{ borderTop: '1px solid #232329', background: '#121215' }}>
          <button
            onClick={handleResolve}
            className="inline-flex items-center gap-1.5 bg-[#10B981] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#059669] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(16,185,129,0.25)] active:translate-y-0 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(16,185,129,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121215]"
          >
            <CheckCircle2 size={12} /> Mark as Resolved
          </button>
          <button
            onClick={handleIgnore}
            className="inline-flex items-center gap-1.5 bg-[#1E1E24] px-3.5 py-2 text-xs font-medium text-[#E6E8F0] hover:bg-[#232329] hover:border-[#2E2E36] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121215]"
            style={{ border: '1px solid #232329' }}
          >
            Ignore
          </button>
          <button
            onClick={handleRetest}
            className="ml-auto inline-flex items-center gap-1.5 bg-[#8B5CF6] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#7C3AED] hover:-translate-y-[1px] hover:shadow-[0_4px_16px_rgba(139,92,246,0.32)] active:translate-y-0 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121215]"
          >
            Retest this check
          </button>
        </div>
      </div>
    </div>
  );
}
