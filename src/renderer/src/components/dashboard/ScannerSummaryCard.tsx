import { useEffect, useState } from 'react';
import { ScanLine, AlertTriangle, Clock, Layers } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import type { SourceScanResult } from '@shared/types/scanner';
import { api } from '../../services/api';

export function ScannerSummaryCard() {
  const [lastScan, setLastScan] = useState<SourceScanResult | null>(null);
  const [prevScan, setPrevScan] = useState<SourceScanResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Try to load last scan from history dir via Tauri, fallback to localStorage
    const load = async () => {
      setLoading(true);
      try {
        // Attempt to get last scan via a dummy path — we don't know projectPath, so we try to read from localStorage first
        const raw = localStorage.getItem('apiforge-last-scan');
        if (raw) {
          const parsed = JSON.parse(raw) as SourceScanResult;
          setLastScan(parsed);
          // Try to get previous via history API if projectPath is known
          // For now, we store previous as null
        } else {
          // Try Tauri history with a generic fallback — not critical
          try {
            const home = await api.scanner.getLastScan('/').catch(() => null);
            if (home) setLastScan(home as any);
          } catch {}
        }
      } catch {}
      finally { setLoading(false); }
    };
    void load();
    // Also listen for watch updates
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<SourceScanResult>('scanner:watch-update', (e) => {
          setPrevScan(lastScan);
          setLastScan(e.payload as unknown as SourceScanResult);
          try { localStorage.setItem('apiforge-last-scan', JSON.stringify(e.payload)); } catch {}
        });
      } catch {}
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Compute diff if both available
  const diff = (() => {
    if (!lastScan || !prevScan) return null;
    try {
      const prevKeys = new Set(prevScan.routes.map(r => `${r.method}:${r.path}`));
      const currKeys = new Set(lastScan.routes.map(r => `${r.method}:${r.path}`));
      const added = [...currKeys].filter(k => !prevKeys.has(k)).length;
      const removed = [...prevKeys].filter(k => !currKeys.has(k)).length;
      // modified: same key but auth change
      let modified = 0;
      let authChanged = false;
      for (const k of prevKeys) {
        if (currKeys.has(k)) {
          const pr = prevScan.routes.find(r => `${r.method}:${r.path}` === k);
          const cr = lastScan.routes.find(r => `${r.method}:${r.path}` === k);
          if (pr && cr && pr.authRequired !== cr.authRequired) {
            modified++;
            if (pr.authRequired && !cr.authRequired) authChanged = true;
          }
        }
      }
      return { added, removed, modified, authChanged };
    } catch { return null; }
  })();

  const handleClick = () => useUiStore.getState().setActivePage('scanner');

  const hasAuthCritical = diff?.authChanged;

  return (
    <button
      onClick={handleClick}
      className="group flex w-full flex-col text-left transition-all duration-200 hover:-translate-y-[1px] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
      style={{
        background: '#121215',
        border: '1px solid #232329',
        borderLeft: hasAuthCritical ? '2px solid #EF4444' : lastScan ? '2px solid #8B5CF6' : '2px solid #232329',
        boxShadow: hasAuthCritical ? '0 0 16px rgba(239,68,68,0.10)' : '0 1px 6px rgba(0,0,0,0.18)',
      }}
    >
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid #1E1E24' }}>
        <span className="flex h-7 w-7 items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>
          <ScanLine size={14} />
        </span>
        <span className="text-sm font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.01em' }}>Scanner</span>
        {lastScan && <span className="ml-auto text-xs tabular-nums px-1.5 py-0.5" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#7A7F93' }}>{lastScan.totalRoutes} routes</span>}
      </div>

      <div className="flex-1 p-4">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-24 skeleton" />
            <div className="h-3 w-32 skeleton" />
          </div>
        ) : !lastScan ? (
          <div>
            <p className="text-sm" style={{ color: '#9FA3B5' }}>No scan yet</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: '#7A7F93' }}>Scan your backend source or live OpenAPI spec to see routes.</p>
            <span className="mt-3 inline-flex text-xs font-medium" style={{ color: '#8B5CF6' }}>Scan project →</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium" style={{ color: '#E6E8F0' }}>{lastScan.framework}</span>
              <span className="text-xs px-1.5 py-0.5" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#9FA3B5' }}>{lastScan.language}</span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs" style={{ color: '#7A7F93' }}><Layers size={11} style={{ color: '#8B5CF6' }} /> {lastScan.totalFiles} files</span>
            </div>

            {diff ? (
              <div className="flex flex-wrap gap-1.5 text-xs tabular-nums">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.18)', color: '#10B981' }}>+{diff.added} added</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.18)', color: '#EF4444' }}>-{diff.removed} removed</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.18)', color: '#F59E0B' }}>{diff.modified} modified</span>
                {hasAuthCritical && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-bold uppercase" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)', color: '#EF4444' }}><AlertTriangle size={10} /> auth change</span>}
              </div>
            ) : (
              <div className="text-xs" style={{ color: '#5A5E6E' }}>{lastScan.totalRoutes} routes · {lastScan.confidence ? `${Math.round(lastScan.confidence*100)}% confidence` : ''}</div>
            )}

            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#5A5E6E' }}>
              <Clock size={11} /> Last scan: {formatRelative((lastScan as any).timestamp ?? Date.now())}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium" style={{ background: '#0E0E10', borderTop: '1px solid #232329', color: '#8B5CF6' }}>
        <span className="group-hover:underline">View →</span>
        {hasAuthCritical && <span className="text-[11px] font-bold uppercase" style={{ color: '#EF4444' }}>critical</span>}
      </div>
    </button>
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
