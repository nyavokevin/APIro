import { useTierGate } from '../../hooks/useTierGate';

function UsageBar({ label, current, max }: { label: string; current: number; max: number | null }) {
  const pct = max == null ? 0 : Math.min(100, (current / max) * 100);
  const over = max != null && current > max;
  const near = max != null && current >= max && !over;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium" style={{ color: '#E6E8F0' }}>{label}</span>
        <span className="font-mono tabular-nums" style={{ color: over ? '#EF4444' : near ? '#F59E0B' : '#9FA3B5' }}>
          {current}{max != null ? ` / ${max}` : ' · unlimited'}
        </span>
      </div>
      {max != null && (
        <div className="h-1.5 overflow-hidden bg-[#0E0E10]" style={{ border: '1px solid #232329' }}>
          <div
            className="h-full transition-all"
            style={{
              width: `${pct}%`,
              background: over ? '#EF4444' : near ? '#F59E0B' : '#8B5CF6',
            }}
          />
        </div>
      )}
      {over && (
        <p className="text-[11px] leading-relaxed" style={{ color: '#FCA5A5' }}>
          You have {current} but your plan allows {max}. Existing items stay fully accessible. Delete some or upgrade to create new ones.
        </p>
      )}
    </div>
  );
}

export function UsageSummaryPanel() {
  const { usage } = useTierGate();
  if (!usage) return null;
  const isFree = usage.tier === 'free';
  return (
    <div className="bg-[#121215] p-4 space-y-3" style={{ border: '1px solid #232329', borderRadius: '0px', boxShadow: '0 1px 6px rgba(0,0,0,0.18)' }}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold tracking-wide uppercase" style={{ color: '#9FA3B5', letterSpacing: '0.06em' }}>
          Usage
        </h4>
        <span className={`text-[11px] px-1.5 py-0.5 border font-medium ${usage.tier === 'free' ? 'bg-[#0E0E10] border-[#232329] text-[#7A7F93]' : 'bg-[rgba(139,92,246,0.10)] border-[rgba(139,92,246,0.18)] text-[#8B5CF6]'}`}>
          {usage.tier === 'free' ? 'Free' : usage.tier === 'pro' ? 'Pro' : 'Team'}
        </span>
      </div>
      <UsageBar label="Collections" current={usage.collections.current} max={usage.collections.max} />
      <UsageBar label="Environments" current={usage.environments.current} max={usage.environments.max} />
      {usage.tier !== 'free' && (
        <UsageBar label="AI Assistant (this month)" current={usage.aiAssistant.current} max={usage.aiAssistant.max} />
      )}
      {isFree && (
        <p className="text-[11px] leading-relaxed pt-1" style={{ color: '#7A7F93' }}>
          Free plan limits are calm and predictable — existing collections stay fully accessible even if you're over the limit after a downgrade.
        </p>
      )}
    </div>
  );
}
