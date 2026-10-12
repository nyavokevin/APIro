import { useState } from 'react';
import { KeyRound, ShieldCheck, AlertTriangle, X, Copy, ExternalLink, Loader2, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { useLicense } from '../../hooks/useLicense';

interface LicenseModalProps {
  open: boolean;
  onClose: () => void;
}

export function LicenseModal({ open, onClose }: LicenseModalProps) {
  const { status, activate, deactivate } = useLicense();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleActivate = async () => {
    setError(null);
    setSuccess(false);
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Please enter a license key.');
      return;
    }
    if (!trimmed.toUpperCase().startsWith('APIRO-')) {
      setError('Key must start with APIRO-');
      return;
    }
    setLoading(true);
    try {
      const next = await activate(trimmed);
      if (next.isPro) {
        setSuccess(true);
        setTimeout(() => onClose(), 900);
      } else {
        setError('Activation succeeded but status is not Pro — check grace period.');
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setError(null);
    setLoading(true);
    try {
      await deactivate();
      setKey('');
      setSuccess(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const isPro = status.isPro;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="License">
      <div className="absolute inset-0 backdrop-blur-[2px]" onClick={onClose} style={{ background: 'rgba(7,7,9,0.78)' }} />
      <div
        className="relative z-10 w-full animate-fadeUp overflow-auto"
        style={{ background: '#121215', border: '1px solid #232329', borderRadius: '0px', maxWidth: '520px', boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #232329' }}>
          <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.02em' }}>
            <span className="flex h-7 w-7 items-center justify-center bg-[#8B5CF6] text-white" style={{ boxShadow: '0 0 12px rgba(139,92,246,0.22)' }}>
              <KeyRound size={14} strokeWidth={1.9} />
            </span>
            License
            <span className={`ml-2 hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border ${isPro ? 'bg-[rgba(16,185,129,0.10)] border-[rgba(16,185,129,0.18)] text-[#10B981]' : 'bg-[#0E0E10] border-[#232329] text-[#7A7F93]'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isPro ? 'bg-[#10B981]' : 'bg-[#7A7F93]'}`} />
              {isPro ? `${status.tier ?? 'pro'} · active` : 'Free'}
            </span>
          </h2>
          <button onClick={onClose} className="text-[#7A7F93] hover:text-[#E6E8F0] hover:bg-[#232329] p-1.5 transition-colors" style={{ borderRadius: '0px' }}>
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-4">
          {isPro ? (
            <div className="flex gap-3 p-3" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)', borderLeft: '2px solid #10B981' }}>
              <ShieldCheck size={16} className="text-[#10B981] shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold" style={{ color: '#10B981' }}>Pro activated</p>
                <p className="mt-1 text-xs leading-relaxed font-mono break-all" style={{ color: '#E6E8F0' }}>
                  {status.licenseId ?? '—'} · {status.seats ?? 1} seat(s) {status.expiresAt ? `· expires ${new Date(status.expiresAt).toLocaleDateString()}` : '· perpetual'}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: '#7A7F93' }}>
                  State: {status.state} {status.lastVerifiedAt ? `· last verified ${new Date(status.lastVerifiedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 p-3" style={{ background: '#0E0E10', border: '1px solid #232329', borderLeft: '2px solid #8B5CF6' }}>
              <KeyRound size={16} className="text-[#8B5CF6] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold" style={{ color: '#E6E8F0' }}>Enter your license key</p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: '#9FA3B5' }}>
                  Format <span className="font-mono bg-[#121215] px-1 py-0.5 border border-[#232329] text-[#E6E8F0]">APIRO-XXXX-XXXX-…</span> — perpetual, offline-first. No account needed.
                </p>
              </div>
            </div>
          )}

          {!isPro && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium" style={{ color: '#9FA3B5' }}>License Key</span>
                <div className="relative flex gap-2">
                  <input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="APIRO-XXXX-XXXX-XXXX-XXXX"
                    className="flex-1 bg-[#0E0E10] px-3 pr-9 text-sm outline-none border placeholder:text-[#5A5E6E] focus:border-[#8B5CF6] hover:border-[#2E2E36] font-mono"
                    style={{ height: '40px', borderColor: '#232329', borderRadius: '0px', color: '#E6E8F0' }}
                    spellCheck={false}
                    autoComplete="off"
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleActivate(); }}
                  />
                  {key && (
                    <button
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(key); setCopied(true); setTimeout(()=>setCopied(false),1200);} catch {}
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-[#7A7F93] hover:text-[#E6E8F0] hover:bg-[#232329]"
                      title="Copy"
                    >
                      {copied ? <Check size={12} className="text-[#10B981]" /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </label>

              {error && (
                <div className="flex gap-2 p-2.5 text-xs leading-relaxed" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderLeft: '2px solid #EF4444', color: '#FCA5A5' }}>
                  <AlertTriangle size={14} className="text-[#EF4444] shrink-0 mt-0.5" />
                  <span className="break-words">{error}</span>
                </div>
              )}
              {success && (
                <div className="flex gap-2 p-2.5 text-xs" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', borderLeft: '2px solid #10B981', color: '#6EE7B7' }}>
                  <ShieldCheck size={14} className="text-[#10B981] shrink-0" /> Activated — Pro features unlocked.
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => void handleActivate()} disabled={loading} className="gap-1.5">
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                  {loading ? 'Verifying…' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
                <a href="https://apiro.dev/pricing" target="_blank" rel="noreferrer" className="ml-auto self-center text-xs text-[#7A7F93] hover:text-[#9FA3B5] inline-flex items-center gap-1">
                  View pricing <ExternalLink size={11} />
                </a>
              </div>

              <p className="text-[11px] leading-relaxed flex gap-1.5" style={{ color: '#5A5E6E' }}>
                <ShieldCheck size={11} className="shrink-0 mt-0.5 text-[#10B981]" />
                Offline-first: once activated, works 100% offline for weeks. Grace 7 days if server unreachable.
              </p>
            </>
          )}

          {isPro && (
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => void handleDeactivate()} disabled={loading} className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)] border border-transparent hover:border-[rgba(239,68,68,0.18)]">
                Deactivate this device
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose} className="ml-auto">Close</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
