import { MockServerPanel } from '../components/mock/MockServerPanel';
import { useTierGate } from '../hooks/useTierGate';
import { ProLockedPanel } from '../components/license/ProLockedPanel';

export function MockServers() {
  const { usage } = useTierGate();
  const enabled = usage ? usage.mockServerEnabled : false;
  // While loading, avoid flash — treat as locked if tier is free
  const isFree = usage?.tier === 'free';

  if (!usage) {
    return <div className="h-full bg-[#070709] p-6"><div className="text-xs text-[#7A7F93]">Loading…</div></div>;
  }

  if (!enabled) {
    return (
      <div className="h-full bg-[#070709] p-6">
        <ProLockedPanel
          feature="Mock Server"
          description="Simulate API responses without a backend. Available on Pro."
        />
        {isFree && (
          <p className="mt-3 text-center text-[11px]" style={{ color: '#7A7F93' }}>
            Free plan: Mock Server is a Pro feature.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="h-full bg-[#070709]">
      <MockServerPanel />
    </div>
  );
}
