import { Lock, Sparkles, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { LicenseModal } from './LicenseModal';

interface Props {
  feature: string;
  description?: string;
}

export function ProLockedPanel({ feature, description }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="flex flex-col items-center text-center p-8 gap-4 animate-fadeUp"
      style={{ background: '#121215', border: '1px solid #232329', borderLeft: '2px solid #8B5CF6', boxShadow: '0 1px 6px rgba(0,0,0,0.18)' }}
    >
      <span className="flex h-10 w-10 items-center justify-center bg-[rgba(139,92,246,0.10)] text-[#8B5CF6] border border-[rgba(139,92,246,0.18)]">
        <Lock size={18} strokeWidth={1.9} />
      </span>
      <div>
        <h3 className="text-sm font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.02em' }}>
          {feature}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed max-w-[36ch] mx-auto" style={{ color: '#9FA3B5' }}>
          {description ?? `${feature} is available on Pro. Enter your license key to unlock.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <Button variant="primary" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <Sparkles size={13} /> Enter License Key
        </Button>
        <a
          href="https://apiro.dev/pricing"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
          style={{ color: '#8B5CF6' }}
        >
          View Pricing <ExternalLink size={11} />
        </a>
      </div>
      <LicenseModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
