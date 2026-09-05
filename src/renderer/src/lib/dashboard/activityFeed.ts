import type { HistoryItem } from '../../services/api';
import type { ScanRecord } from '../../stores/securityStore';
import type { Collection } from '@shared/types/request';

export type ActivityType = 'request' | 'scan' | 'collection_update' | 'security_finding' | 'test_run' | 'mock' | 'environment';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: number;
  summary: string;
  detail?: string;
  link?: string; // internal page to navigate
  icon?: string;
}

export interface ActivitySources {
  requestHistory: HistoryItem[];
  scanHistory: ScanRecord[];
  collections: Collection[];
  // optional future: testRuns, mockHits, envChanges
  testRuns?: Array<{ id: string; timestamp: number; name: string; passed: number; total: number }>;
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

export function buildActivityFeed(sources: ActivitySources, limit = 20): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const h of sources.requestHistory.slice(0, 20)) {
    const status = h.statusCode != null ? `${h.statusCode}` : 'ERR';
    const ok = h.statusCode != null && h.statusCode < 400;
    items.push({
      id: `req-${h.id}`,
      type: 'request',
      timestamp: h.timestamp,
      summary: `${h.method} ${h.url} — ${status} ${ok ? 'OK' : ''}`.trim(),
      detail: `${h.responseTime ?? '—'}ms`,
      link: 'workspace',
    });
  }

  for (const s of sources.scanHistory.slice(0, 10)) {
    items.push({
      id: `scan-${s.id}`,
      type: 'scan',
      timestamp: s.timestamp,
      summary: `${s.label ?? `Scan #${s.id.slice(-4)}`} — ${s.findingCount} findings`,
      detail: `${s.requestCount} req · ${s.environment ?? 'Local'}`,
      link: 'security',
    });
  }

  for (const c of sources.collections.slice(0, 10)) {
    items.push({
      id: `col-${c.id}`,
      type: 'collection_update',
      timestamp: c.updatedAt ?? Date.now(),
      summary: `Collection "${c.name}" updated`,
      detail: `${(c.children?.length ?? 0)} items`,
      link: 'collections',
    });
  }

  if (sources.testRuns) {
    for (const r of sources.testRuns.slice(0, 10)) {
      items.push({
        id: `test-${r.id}`,
        type: 'test_run',
        timestamp: r.timestamp,
        summary: `${r.name} — ${r.passed}/${r.total} passed`,
        link: 'testing',
      });
    }
  }

  // sort desc and limit
  items.sort((a, b) => b.timestamp - a.timestamp);
  return items.slice(0, limit);
}

export { formatRelative };
