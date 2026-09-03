import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';
import { useNotificationStore, type ToastVariant } from '../../stores/notificationStore';

const variantStyles: Record<ToastVariant, { borderLeft: string; icon: typeof CheckCircle2; iconColor: string }> = {
  success: { borderLeft: '#10B981', icon: CheckCircle2, iconColor: '#10B981' },
  error: { borderLeft: '#EF4444', icon: XCircle, iconColor: '#EF4444' },
  warning: { borderLeft: '#FBBF24', icon: AlertTriangle, iconColor: '#FBBF24' },
  info: { borderLeft: '#8B5CF6', icon: Info, iconColor: '#8B5CF6' },
};

export function Toaster() {
  const toasts = useNotificationStore((s) => s.toasts);
  const dismiss = useNotificationStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-0 right-0 z-[100] flex flex-col gap-2 p-4"
      style={{ maxWidth: '420px', width: '100%' }}
    >
      {toasts.map((t) => {
        const v = variantStyles[t.variant];
        const Icon = v.icon;
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 bg-[#121212] px-4 py-3"
            style={{
              border: '1px solid #262626',
              borderLeft: `2px solid ${v.borderLeft}`,
              borderRadius: '0px',
              boxShadow: 'none',
            }}
          >
            <Icon size={16} className="mt-0.5 shrink-0" style={{ color: v.iconColor }} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[#E2E8F0]" style={{ fontSize: '13px', lineHeight: '18px', fontWeight: 500 }}>
                {t.title}
              </div>
              {t.description && (
                <div className="mt-1 text-xs text-[#8F909E]" style={{ fontSize: '12px', lineHeight: '16px' }}>
                  {t.description}
                </div>
              )}
              {t.actionLabel && t.onAction && (
                <button
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                  className="mt-2 text-xs font-medium text-[#8B5CF6] hover:text-[#7C3AED]"
                  style={{ fontSize: '12px' }}
                >
                  {t.actionLabel} →
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 p-1 text-[#8F909E] hover:text-[#E2E8F0]"
              style={{ borderRadius: '0px' }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
