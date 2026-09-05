import { Server, Radio, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { MockServer } from '@shared/types/request';
import { useUiStore } from '../../stores/uiStore';

export function MocksStatusBar() {
  const [servers, setServers] = useState<MockServer[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.mockServer.listV2().catch(() => api.mockServer.list().catch(() => [] as MockServer[]));
      setServers(Array.isArray(list) ? list : []);
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, []);

  const active = servers.filter((s) => s.running);

  if (!loading && active.length === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#121215', border: '1px solid #232329' }}>
      <span className="flex h-7 w-7 items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.22)', color: '#10B981' }}>
        <Radio size={14} className={active.length ? 'animate-pulse' : ''} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: '#E6E8F0' }}>
          {active.length} mock server{active.length === 1 ? '' : 's'} running
        </div>
        <div className="text-xs tabular-nums truncate" style={{ color: '#9FA3B5' }}>
          {active.map((s) => `:${s.port}`).join(', ') || ' —'}
          {loading ? ' · refreshing…' : ''}
        </div>
      </div>
      <button
        onClick={() => useUiStore.getState().setActivePage('mocks')}
        className="inline-flex items-center gap-1 text-xs font-medium hover:underline shrink-0 px-2.5 py-1.5"
        style={{ background: '#0E0E10', border: '1px solid #232329', color: '#8B5CF6' }}
      >
        <Server size={12} /> Manage <ExternalLink size={11} />
      </button>
    </div>
  );
}
