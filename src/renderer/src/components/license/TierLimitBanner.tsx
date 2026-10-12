import { Info, X } from 'lucide-react';
import { useState } from 'react';
import type { GateResult } from '../../hooks/useTierGate';
import { describeReason } from '../../lib/tierGateText';
import { LicenseModal } from './LicenseModal';

interface Props {
  result: Extract<GateResult, { type: 'Denied' }>;
  onDismiss?: () => void;
  inline?: boolean;
}

export function TierLimitBanner({ result, onDismiss, inline }: Props) {
  const [licenseOpen, setLicenseOpen] = useState(false);
  const reason = (result as Extract<GateResult, { type: 'Denied' }>).reason;
  const hint = (result as Extract<GateResult, { type: 'Denied' }>).upgradeHint;
  const message = describeReason(reason);

  return (
    <>
      <div
        role="status"
        className={`flex items-start gap-2.5 px-3 py-2.5 text-xs leading-relaxed animate-fadeUp ${inline ? '' : 'mt-2'}`}
        style={{
          background: 'rgba(139,92,246,0.08)',
          border: '1px solid rgba(139,92,246,0.20)',
          borderLeft: '2px solid #8B5CF6',
          color: '#E6E8F0',
        }}
      >
        <Info size={14} className="text-[#8B5CF6] shrink-0 mt-0.5" />
        <span className="flex-1" style={{ color: '#E6E8F0' }}>
          {message}
        </span>
        <button
          onClick={() => setLicenseOpen(true)}
          className="shrink-0 bg-[#8B5CF6] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#7C3AED] active:scale-[0.98] transition-all"
        >
          {hint}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex h-6 w-6 shrink-0 items-center justify-center text-[#7A7F93] hover:bg-[#232329] hover:text-[#E6E8F0] transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <LicenseModal open={licenseOpen} onClose={() => setLicenseOpen(false)} />
    </>
  );
}
