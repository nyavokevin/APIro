import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface NotificationState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;
function genId() {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  toasts: [],
  addToast: (t) => {
    const id = genId();
    const toast: Toast = {
      durationMs: t.variant === 'error' ? 5000 : 3500,
      ...t,
      id,
    };
    set((s) => {
      const next = [...s.toasts, toast];
      // max 3 visible, drop oldest
      return { toasts: next.slice(-3) };
    });
    const duration = toast.durationMs ?? 3500;
    if (duration > 0) {
      window.setTimeout(() => {
        get().dismiss(id);
      }, duration);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
