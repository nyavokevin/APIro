import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={title}>
        <div className="absolute inset-0 bg-black/80" onClick={onClose} style={{ background: 'rgba(0,0,0,0.8)' }} />
        <div
          className={cn('relative z-10 max-h-[85vh] w-full overflow-auto bg-[#121212]', className)}
          style={{ border: '1px solid #262626', borderRadius: '0px', maxWidth: '480px', padding: '0' }}
        >
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #262626' }}>
            <h2 className="text-lg font-semibold text-[#E2E8F0]" style={{ fontSize: '18px', lineHeight: '26px', fontWeight: 600 }}>{title}</h2>
            <button onClick={onClose} className="text-[#8F909E] hover:text-[#E2E8F0] p-1" aria-label="Close" style={{ borderRadius: '0px' }}>
              <X size={18} />
            </button>
          </div>
          <div className="px-6 py-6" style={{ padding: '24px' }}>{children}</div>
          {footer && <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid #262626' }}>{footer}</div>}
      </div>
    </div>
  );
}
