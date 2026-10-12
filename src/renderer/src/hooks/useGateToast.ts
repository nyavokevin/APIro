import { useCallback, useRef } from 'react';
import { useNotificationStore } from '../stores/notificationStore';
import type { GateResult } from './useTierGate';
import { describeReason } from '../lib/tierGateText';

export function useGateToast() {
  const shown = useRef<Set<string>>(new Set());
  const addToast = useNotificationStore((s) => s.addToast);

  return useCallback(
    (result: Extract<GateResult, { type: 'Denied' }>) => {
      const key = JSON.stringify(result.reason);
      if (shown.current.has(key)) return;
      shown.current.add(key);
      const message = describeReason(result.reason);
      addToast({
        variant: 'info',
        title: message,
        description: result.upgradeHint,
        durationMs: 6000,
        actionLabel: result.upgradeHint,
        onAction: () => {
          // Open license modal is handled by banner; toast action just focuses settings
          window.dispatchEvent(new CustomEvent('apiro:open-license'));
        },
      });
    },
    [addToast]
  );
}
