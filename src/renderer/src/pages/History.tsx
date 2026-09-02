import { useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw, Search, Star, Calendar, Filter, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { HttpMethod, KeyValuePair, RequestData } from '@shared/types/request';
import { HTTP_METHODS, METHOD_COLORS } from '@shared/constants/methods';
import { api, type HistoryItem } from '../services/api';
import { useRequestStore } from '../stores/requestStore';
import { uid } from '../lib/id';
import { requestPath } from '../lib/tabLabel';
import { dedupeHistory, relativeTime, type DedupedEntry } from '../lib/history';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SaveToCollectionModal } from '../components/collections/SaveToCollectionModal';

const keyOf = (method: string, url: string) => `${method.toUpperCase()} ${url}`;

function statusColor(status: number | null): string {
  if (status == null) return 'var(--text-secondary)';
  if (status < 300) return 'var(--success)';
  if (status < 400) return 'var(--warning)';
  return 'var(--danger)';
}

function toRequest(item: HistoryItem): RequestData {
  let headers: KeyValuePair[] = [];
  try {
    const parsed = JSON.parse(item.requestHeaders || '[]');
    if (Array.isArray(parsed)) headers = parsed;
  } catch {
    headers = [];
  }
  let params: KeyValuePair[] = [];
  try {
    const parsed = JSON.parse((item as any).requestParams || item.requestParams || '[]');
    if (Array.isArray(parsed)) params = parsed;
  } catch {
    params = [];
  }
  // Ensure each param has an id (history may have stored without ids after JSON round-trip)
  params = params.map((p: any) => ({ id: p.id ?? uid(), key: p.key ?? '', value: p.value ?? '', enabled: p.enabled ?? true, description: p.description }));
  const body = (item as any).requestBody ?? (item as any).request_body ?? '';
  const bodyType = ((item as any).requestBodyType ?? (item as any).request_body_type ?? 'none') as RequestData['bodyType'];
  const method = (HTTP_METHODS as string[]).includes(item.method) ? (item.method as HttpMethod) : 'GET';
  const name = item.url ? `${item.method} ${requestPath(item.url)}` : 'History Request';
  return {
    id: item.requestId ?? uid(),
    name,
    method,
    url: item.url,
    headers,
    params,
    bodyType: (['none','json','xml','text','form-data','urlencoded','binary','graphql'] as string[]).includes(bodyType as string) ? (bodyType as RequestData['bodyType']) : 'none',
    body: body ?? '',
    auth: { type: 'none' },
  };
}

type DateFilter = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'custom';

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getDateFilterRange(filter: DateFilter, customFrom?: string, customTo?: string): { from: number | null; to: number | null } {
  const now = Date.now();
  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 86400000;
  switch (filter) {
    case 'today':
      return { from: todayStart, to: now };
    case 'yesterday':
      return { from: yesterdayStart, to: todayStart - 1 };
    case 'last7':
      return { from: now - 7 * 86400000, to: now };
    case 'last30':
      return { from: now - 30 * 86400000, to: now };
    case 'custom': {
      if (!customFrom && !customTo) return { from: null, to: null };
      const from = customFrom ? new Date(customFrom).setHours(0, 0, 0, 0) : null;
      const to = customTo ? new Date(customTo).setHours(23, 59, 59, 999) : null;
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

function formatDateGroup(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yStr = yesterday.toDateString();
  if (d.toDateString() === todayStr) return 'Today';
  if (d.toDateString() === yStr) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

const ALL_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];
const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: '2xx', label: '2xx Success' },
  { value: '3xx', label: '3xx Redirect' },
  { value: '4xx', label: '4xx Client Error' },
  { value: '5xx', label: '5xx Server Error' },
  { value: 'error', label: 'Network / Error' },
] as const;

export function History() {
  const openRequest = useRequestStore((s) => s.openRequest);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [starTarget, setStarTarget] = useState<RequestData | null>(null);

  // Filters
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [methodFilter, setMethodFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await api.requests.history(200));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const rawByKey = useMemo(() => {
    const map = new Map<string, HistoryItem>();
    for (const i of items) map.set(keyOf(i.method, i.url), i);
    return map;
  }, [items]);

  const deduped = useMemo(() => dedupeHistory(items.map((i) => ({
    id: i.id,
    method: i.method,
    url: i.url,
    statusCode: i.statusCode,
    responseTime: i.responseTime,
    error: i.error,
    timestamp: i.timestamp,
  }))), [items]);

  const filtered = useMemo(() => {
    let rows: DedupedEntry[] = deduped;

    // Query
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((e) => e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q) || String(e.statusCode ?? '').includes(q));
    }

    // Method filter
    if (methodFilter.size > 0) {
      rows = rows.filter((e) => methodFilter.has(e.method.toUpperCase()));
    }

    // Status filter
    if (statusFilter !== 'all') {
      rows = rows.filter((e) => {
        if (statusFilter === 'error') return e.statusCode == null || !!e.error;
        if (e.statusCode == null) return false;
        if (statusFilter === '2xx') return e.statusCode >= 200 && e.statusCode < 300;
        if (statusFilter === '3xx') return e.statusCode >= 300 && e.statusCode < 400;
        if (statusFilter === '4xx') return e.statusCode >= 400 && e.statusCode < 500;
        if (statusFilter === '5xx') return e.statusCode >= 500;
        return true;
      });
    }

    // Date filter
    const { from, to } = getDateFilterRange(dateFilter, customFrom, customTo);
    if (from != null || to != null) {
      rows = rows.filter((e) => {
        if (from != null && e.timestamp < from) return false;
        if (to != null && e.timestamp > to) return false;
        return true;
      });
    }

    return rows;
  }, [deduped, query, methodFilter, statusFilter, dateFilter, customFrom, customTo]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [query, methodFilter, statusFilter, dateFilter, customFrom, customTo, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const grouped = useMemo(() => {
    const groups = new Map<string, DedupedEntry[]>();
    for (const row of paginated) {
      const key = formatDateGroup(row.timestamp);
      const arr = groups.get(key);
      if (arr) arr.push(row);
      else groups.set(key, [row]);
    }
    return groups;
  }, [paginated]);

  const open = (row: DedupedEntry) => {
    const raw = rawByKey.get(keyOf(row.method, row.url));
    if (raw) openRequest(toRequest(raw));
  };

  const toggleMethod = (m: string) => {
    setMethodFilter((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const clearFilters = () => {
    setQuery('');
    setDateFilter('all');
    setCustomFrom('');
    setCustomTo('');
    setMethodFilter(new Set());
    setStatusFilter('all');
    setPage(1);
  };

  const hasActiveFilters = query || dateFilter !== 'all' || methodFilter.size > 0 || statusFilter !== 'all';

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg-primary)]">
      {/* Sidebar filters */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="border-b border-[var(--border)] p-3">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Clock size={16} className="text-[var(--accent)]" /> History
            <span className="ml-auto rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs font-mono text-[var(--text-secondary)]">
              {filtered.length}/{items.length}
            </span>
          </h2>

          <div className="relative mb-3">
            <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-[var(--text-muted)]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search URL, method, status…" className="pl-7" />
          </div>

          <div className="mb-3">
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Calendar size={12} /> Date
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(['all', 'today', 'yesterday', 'last7', 'last30', 'custom'] as DateFilter[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setDateFilter(v)}
                  className={`rounded px-2 py-1.5 text-xs font-medium capitalize ${
                    dateFilter === v ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {v === 'last7' ? '7d' : v === 'last30' ? '30d' : v}
                </button>
              ))}
            </div>
            {dateFilter === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-xs" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-xs" />
              </div>
            )}
          </div>

          <div className="mb-3">
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)]">
              <Filter size={12} /> Method
            </label>
            <div className="flex flex-wrap gap-1">
              {ALL_METHODS.map((m) => {
                const active = methodFilter.has(m);
                return (
                  <button
                    key={m}
                    onClick={() => toggleMethod(m)}
                    className={`rounded px-2 py-1 text-xs font-mono font-semibold ${active ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                    style={!active ? { color: METHOD_COLORS[m] } : undefined}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1 text-xs font-medium text-[var(--text-secondary)]">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading} className="flex-1">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!hasActiveFilters} className="flex-1">
              <X size={14} /> Clear
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3">
            <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Pagination</div>
            <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>{filtered.length} results</span>
              <span>Page {currentPage} / {totalPages}</span>
            </div>
            <div className="mb-2 flex items-center gap-1">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} className="flex-1">
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="flex-1">
                Next <ChevronRight size={14} />
              </Button>
            </div>
            <label className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
              Per page
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            {hasActiveFilters && <p className="mt-2 text-xs text-[var(--text-muted)]">{filtered.length} of {deduped.length} deduped entries</p>}
          </div>

          <div className="mt-3 rounded border border-dashed border-[var(--border)] bg-[var(--bg-primary)] p-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Per-date</strong> groups by <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono">Today / Yesterday / date</code>. Deduped by method+URL (×N).
          </div>
        </div>
      </aside>

      {/* Main list — full width */}
      <section className="flex min-w-0 flex-1 flex-col bg-[var(--bg-primary)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5">
          <div className="text-xs text-[var(--text-secondary)]">
            Showing <span className="font-mono font-medium text-[var(--text-primary)]">{paginated.length}</span> of <span className="font-mono text-[var(--text-primary)]">{filtered.length}</span> {filtered.length === 1 ? 'entry' : 'entries'}
            {hasActiveFilters && <span className="ml-2 rounded bg-[var(--accent-subtle)] px-1.5 py-0.5 text-[var(--accent)]">filtered</span>}
          </div>
          <div className="hidden items-center gap-1.5 text-xs text-[var(--text-muted)] sm:flex">
            <span className="hidden sm:inline">Deduped ×N • Click or double-click to reopen with params / body / headers • Star to collect</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {paginated.length === 0 ? (
            <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center">
              <p className="text-sm text-[var(--text-secondary)]">{items.length === 0 ? 'No requests sent yet. History appears here automatically.' : 'No matches for current filters.'}</p>
              {hasActiveFilters && <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-3">Clear filters</Button>}
            </div>
          ) : (
            <div className="space-y-4">
              {[...grouped.entries()].map(([dateLabel, rows]) => (
                <div key={dateLabel} className="rounded border border-[var(--border)] bg-[var(--bg-secondary)]">
                  <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                    <Calendar size={12} /> {dateLabel} <span className="ml-auto font-mono text-[var(--text-muted)]">{rows.length}</span>
                  </div>
                  <ul className="divide-y divide-[var(--border)]/60">
                    {rows.map((row) => (
                      <li
                        key={`${row.method}-${row.url}-${row.timestamp}`}
                        className="group flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-tertiary)]"
                        onDoubleClick={() => open(row)}
                        title="Double-click to open request with params / body / headers"
                      >
                        <button type="button" onClick={() => open(row)} onDoubleClick={(e) => { e.preventDefault(); open(row); }} title="Open in a workspace tab — double-click restores params / body / headers" className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <span className="w-11 shrink-0 font-mono text-[10px] font-semibold" style={{ color: METHOD_COLORS[row.method as HttpMethod] ?? 'var(--text-secondary)' }}>{row.method}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">{row.url}</span>
                          {(() => {
                            const raw = rawByKey.get(keyOf(row.method, row.url));
                            if (!raw) return null;
                            const rp = (raw as any).requestParams ?? (raw as any).request_params ?? '';
                            const rb = (raw as any).requestBody ?? (raw as any).request_body ?? '';
                            const rh = raw.requestHeaders ?? '';
                            const hasParams = rp && rp !== '[]' && rp !== '' && rp !== 'null';
                            const hasBody = rb && rb !== '' && rb !== '{}';
                            const hasHeaders = rh && rh !== '[]' && rh !== '{}' && rh !== '';
                            if (!hasParams && !hasBody && !hasHeaders) return null;
                            return (
                              <span className="hidden shrink-0 items-center gap-1 sm:flex" title={`${hasParams ? 'params ' : ''}${hasBody ? 'body ' : ''}${hasHeaders ? 'headers' : ''}— double-click to restore`}>
                                {hasParams && <span className="rounded bg-[var(--accent-subtle)] px-1 py-0.5 text-[10px] font-mono font-semibold text-[var(--accent)]">P</span>}
                                {hasBody && <span className="rounded bg-[var(--accent-subtle)] px-1 py-0.5 text-[10px] font-mono font-semibold text-[var(--accent)]">B</span>}
                                {hasHeaders && <span className="rounded bg-[var(--accent-subtle)] px-1 py-0.5 text-[10px] font-mono font-semibold text-[var(--accent)]">H</span>}
                              </span>
                            );
                          })()}
                          {row.hits > 1 && <span className="shrink-0 rounded bg-[var(--bg-tertiary)] px-1.5 text-[10px] text-[var(--text-secondary)]" title={`${row.hits} hits`}>×{row.hits}</span>}
                          <span className="w-8 shrink-0 text-right font-mono text-xs" style={{ color: statusColor(row.statusCode) }}>{row.statusCode ?? '—'}</span>
                          <span className="hidden w-14 shrink-0 text-right font-mono text-xs text-[var(--text-secondary)] sm:block">{row.responseTime != null ? `${row.responseTime}ms` : '—'}</span>
                          <span className="hidden w-16 shrink-0 text-right text-xs text-[var(--text-secondary)] sm:block">{relativeTime(row.timestamp)}</span>
                        </button>
                        <button
                          onClick={() => {
                            const raw = rawByKey.get(keyOf(row.method, row.url));
                            if (raw) setStarTarget(toRequest(raw));
                          }}
                          className="shrink-0 text-[var(--text-secondary)] opacity-0 hover:text-[var(--accent)] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                          aria-label="Save to collection"
                          title="Promote to collection"
                        >
                          <Star size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Pagination footer — full width */}
          {filtered.length > pageSize && (
            <div className="mt-4 flex items-center justify-between rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                <ChevronLeft size={14} /> Prev
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let n: number;
                  if (totalPages <= 5) n = i + 1;
                  else if (currentPage <= 3) n = i + 1;
                  else if (currentPage >= totalPages - 2) n = totalPages - 4 + i;
                  else n = currentPage - 2 + i;
                  return (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`h-7 w-7 rounded text-xs font-mono ${n === currentPage ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      {n}
                    </button>
                  );
                })}
                {totalPages > 5 && <span className="px-1 text-xs text-[var(--text-muted)]">… {totalPages}</span>}
              </div>
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                Next <ChevronRight size={14} />
              </Button>
            </div>
          )}

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Entries with the same method and URL are merged (×N). Star to save into a collection. Filters + pagination are client-side on the last 200 requests.
          </p>
        </div>
      </section>

      <SaveToCollectionModal open={starTarget !== null} onClose={() => setStarTarget(null)} request={starTarget} />
    </div>
  );
}
