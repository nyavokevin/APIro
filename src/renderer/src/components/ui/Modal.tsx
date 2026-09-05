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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
        <div className="absolute inset-0 backdrop-blur-[2px]" onClick={onClose} style={{ background: 'rgba(7,7,9,0.78)' }} />
        <div
          className={cn('relative z-10 max-h-[85vh] w-full overflow-auto animate-fadeUp', className)}
          style={{ background: '#121215', border: '1px solid #232329', borderRadius: '0px', maxWidth: '520px', padding: '0', boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #232329' }}>
            <h2 className="text-lg font-semibold tracking-tight" style={{ fontFamily: 'var(--font-sans)', fontSize: '17px', lineHeight: '26px', fontWeight: 640, color: '#E6E8F0', letterSpacing: '-0.02em' }}>{title}</h2>
            <button onClick={onClose} className="text-[#7A7F93] hover:text-[#E6E8F0] hover:bg-[#232329] p-1.5 transition-colors active:scale-95" aria-label="Close" style={{ borderRadius: '0px' }}>
              <X size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="px-6 py-6" style={{ padding: '24px' }}>{children}</div>
          {footer && <div className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: '1px solid #232329', background: '#0E0E10' }}>{footer}</div>}
      </div>
    </div>
  );
}
