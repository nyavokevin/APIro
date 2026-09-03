import { Shield } from 'lucide-react';
import { useSecurityStore } from '../../stores/securityStore';
import { useUiStore } from '../../stores/uiStore';
import { useRequestStore } from '../../stores/requestStore';
import { useNotificationStore } from '../../stores/notificationStore';

interface SecurityButtonProps {
  requestId?: string;
  compact?: boolean;
}

export function SecurityButton({ requestId, compact = false }: SecurityButtonProps) {
  const count = useSecurityStore((s) =>
    requestId ? s.getFindingCountForRequest(requestId) : s.findings.filter((f) => !f.dismissed).length
  );
  const runPassiveScanForRequest = useSecurityStore((s) => s.runPassiveScanForRequest);
  const setSelectedRequestId = useSecurityStore((s) => s.setSelectedRequestId);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const hasCritical = useSecurityStore((s) =>
    requestId
      ? s.findings.some((f) => f.requestId === requestId && !f.dismissed && (f.severity === 'critical' || f.severity === 'high'))
      : false
  );

  const handleClick = () => {
    if (requestId) setSelectedRequestId(requestId);
    // Trigger passive scan on last response if exists
    if (requestId) {
      const tab = useRequestStore.getState().tabs.find((t) => t.id === requestId);
      if (tab?.response) {
        const fresh = runPassiveScanForRequest(tab.request, tab.response);
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
      }
    }
    setActivePage('security');
  };

  return (
    <button
      onClick={handleClick}
      title={count > 0 ? `${count} security finding(s) — open Security` : 'Security — scan this request'}
      aria-label={`Security ${count > 0 ? `(${count})` : ''}`}
      className="relative inline-flex items-center justify-center gap-1.5 font-medium shrink-0"
      style={{
        background: hasCritical ? 'rgba(239,68,68,0.10)' : '#121212',
        color: hasCritical ? '#EF4444' : '#E2E8F0',
        border: `1px solid ${hasCritical ? 'rgba(239,68,68,0.40)' : '#262626'}`,
        borderRadius: '0px',
        height: '40px',
        padding: compact ? '0 10px' : '0 14px',
        fontSize: '13px',
        lineHeight: '20px',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = hasCritical ? 'rgba(239,68,68,0.16)' : '#1A1A1A';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = hasCritical ? 'rgba(239,68,68,0.10)' : '#121212';
      }}
    >
      <Shield size={16} strokeWidth={1.9} className={hasCritical ? 'text-[#EF4444]' : 'text-[#8B5CF6]'} style={{ color: hasCritical ? '#EF4444' : '#8B5CF6' }} />
      <span className="hidden sm:inline">Security</span>
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
  );
}
