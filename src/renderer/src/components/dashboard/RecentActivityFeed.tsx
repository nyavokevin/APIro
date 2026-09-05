import { useEffect, useMemo, useState } from 'react';
import { Clock, FileText, Shield, Boxes, FlaskConical, Globe, ChevronDown } from 'lucide-react';
import { api, type HistoryItem } from '../../services/api';
import { useSecurityStore } from '../../stores/securityStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { buildActivityFeed, type ActivityItem } from '../../lib/dashboard/activityFeed';

function iconFor(type: ActivityItem['type']) {
  switch (type) {
    case 'request': return <Globe size={12} style={{ color: '#8B5CF6' }} />;
    case 'scan': return <Shield size={12} style={{ color: '#F59E0B' }} />;
    case 'collection_update': return <Boxes size={12} style={{ color: '#10B981' }} />;
    case 'test_run': return <FlaskConical size={12} style={{ color: '#60A5FA' }} />;
    default: return <FileText size={12} style={{ color: '#9FA3B5' }} />;
  }
}

export function RecentActivityFeed() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const scans = useSecurityStore((s) => s.scans);
  const collections = useWorkspaceStore((s) => s.collections);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await api.requests.history(30);
        if (!cancelled) setHistory(h);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [scans, collections]);

  const items = useMemo(() => buildActivityFeed({ requestHistory: history, scanHistory: scans, collections }), [history, scans, collections]);
  const visible = expanded ? items.slice(0, 20) : items.slice(0, 5);

  const handleClick = (item: ActivityItem) => {
    if (item.link) useUiStore.getState().setActivePage(item.link as any);
  };

  return (
    <div className="flex flex-col" style={{ background: '#121215', border: '1px solid #232329' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid #1E1E24' }}>
        <span className="flex h-6 w-6 items-center justify-center" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#8B5CF6' }}>
          <Clock size={12} />
        </span>
        <span className="text-sm font-semibold tracking-tight" style={{ color: '#E6E8F0' }}>Recent Activity</span>
        <span className="ml-auto text-xs tabular-nums px-1.5 py-0.5" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#7A7F93' }}>{items.length}</span>
      </div>

      {visible.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm" style={{ color: '#9FA3B5' }}>No activity yet</p>
          <p className="mt-1 text-xs" style={{ color: '#7A7F93' }}>Send a request, run a scan, or update a collection to see it here.</p>
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: '#1E1E24' }}>
          {visible.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => handleClick(item)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#16161A] active:bg-[#1E1E24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center" style={{ background: '#0E0E10', border: '1px solid #232329' }}>
                  {iconFor(item.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" style={{ color: '#E6E8F0' }}>{item.summary}</span>
                  {item.detail && <span className="block truncate text-xs" style={{ color: '#7A7F93' }}>{item.detail}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: '#5A5E6E' }}>{formatRelative(item.timestamp)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 py-2.5 text-xs font-medium hover:bg-[#16161A] transition-colors"
          style={{ borderTop: '1px solid #1E1E24', color: '#8B5CF6' }}
        >
          {expanded ? 'Show less' : `Show more (${Math.min(20, items.length) - 5} more)`} <ChevronDown size={12} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
      )}
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}
