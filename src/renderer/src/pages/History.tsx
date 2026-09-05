import { useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw, Search, Star, Calendar, Filter, ChevronLeft, ChevronRight, X, ChevronDown, ChevronUp, ExternalLink, Copy, AlertCircle, FileText, Sparkles, History as HistoryIcon, Zap } from 'lucide-react';
import type { HttpMethod, KeyValuePair, RequestData } from '@shared/types/request';
import { HTTP_METHODS, METHOD_COLORS } from '@shared/constants/methods';
import { api, type HistoryItem } from '../services/api';
import { useRequestStore } from '../stores/requestStore';
import { useNotificationStore } from '../stores/notificationStore';
import { uid } from '../lib/id';
import { requestPath } from '../lib/tabLabel';
import { dedupeHistory, relativeTime, type DedupedEntry } from '../lib/history';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SaveToCollectionModal } from '../components/collections/SaveToCollectionModal';

const keyOf = (method: string, url: string) => `${method.toUpperCase()} ${url}`;

function statusColor(status: number | null): string {
  if (status == null) return '#7A7F93';
  if (status < 300) return '#10B981';
  if (status < 400) return '#FBBF24';
  return '#EF4444';
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

function tryPrettyJson(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  if (!s) return '';
  try {
    const parsed = JSON.parse(s);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

function kvListFromJson(json: string): KeyValuePair[] {
  try {
    const parsed = JSON.parse(json || '[]');
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [methodFilter, setMethodFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
    for (const i of items) {
      const k = keyOf(i.method, i.url);
      const existing = map.get(k);
      if (!existing || i.timestamp > existing.timestamp) map.set(k, i);
    }
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
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((e) => e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q) || String(e.statusCode ?? '').includes(q));
    }
    if (methodFilter.size > 0) {
      rows = rows.filter((e) => methodFilter.has(e.method.toUpperCase()));
    }
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
    if (!raw) return;
    const req = toRequest(raw);
    const { tabs } = useRequestStore.getState();
    const isDuplicated = tabs.some((t) => t.request.method === req.method && t.request.url === req.url);
    if (isDuplicated) {
      useNotificationStore.getState().addToast({
        variant: 'warning',
        title: 'Duplicated',
        description: `${req.method} ${req.url} is already open in workspace`,
      });
    } else {
      useNotificationStore.getState().addToast({
        variant: 'success',
        title: 'Added to workspace',
        description: `${req.method} ${req.url}`,
      });
    }
    openRequest(req);
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
    <div className="flex flex-1 min-h-0 max-h-full bg-[#070709] overflow-hidden" style={{ height: '100%', maxHeight: '100%' }}>
      {/* Sidebar filters — fixed, scrolls independently */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r bg-[#0E0E10] overflow-hidden max-h-full" style={{ borderColor: '#232329', maxHeight: '100%' }}>
        <div className="sticky top-0 z-10 border-b p-3" style={{ background: '#0E0E10', borderColor: '#232329' }}>
          <h2 className="mb-3 flex items-center gap-2.5 text-[13px] font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.015em' }}>
            <span className="flex h-7 w-7 items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>
              <Clock size={14} strokeWidth={1.9} />
            </span>
            History
            <span
              className="ml-auto px-2 py-0.5 text-[11px] font-mono font-medium tabular-nums"
              style={{ background: '#121215', border: '1px solid #232329', color: '#9FA3B5' }}
            >
              {filtered.length}/{items.length}
            </span>
          </h2>

          <div className="relative mb-3">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-[11px]" style={{ color: '#5A5E6E' }} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search URL, method, status…"
              className="pl-8 text-sm"
            />
          </div>

          <div className="mb-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#7A7F93', letterSpacing: '0.06em' }}>
              <Calendar size={11} /> Date
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(['all', 'today', 'yesterday', 'last7', 'last30', 'custom'] as DateFilter[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setDateFilter(v)}
                  className="px-2 py-1.5 text-xs font-medium capitalize transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
                  style={{
                    background: dateFilter === v ? '#8B5CF6' : '#121215',
                    color: dateFilter === v ? '#FFFFFF' : '#9FA3B5',
                    border: `1px solid ${dateFilter === v ? '#8B5CF6' : '#232329'}`,
                    borderRadius: 0,
                    boxShadow: dateFilter === v ? '0 0 10px rgba(139,92,246,0.22)' : 'none',
                  }}
                >
                  {v === 'last7' ? '7d' : v === 'last30' ? '30d' : v}
                </button>
              ))}
            </div>
            {dateFilter === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-1.5 animate-fadeUp">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="text-xs" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="text-xs" />
              </div>
            )}
          </div>

          <div className="mb-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#7A7F93', letterSpacing: '0.06em' }}>
              <Filter size={11} /> Method
            </label>
            <div className="flex flex-wrap gap-1">
              {ALL_METHODS.map((m) => {
                const active = methodFilter.has(m);
                return (
                  <button
                    key={m}
                    onClick={() => toggleMethod(m)}
                    className="px-2 py-1 text-[11px] font-mono font-bold transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
                    style={{
                      background: active ? '#8B5CF6' : '#121215',
                      color: active ? '#FFFFFF' : (METHOD_COLORS[m] as string),
                      border: `1px solid ${active ? '#8B5CF6' : '#232329'}`,
                      borderRadius: 0,
                      boxShadow: active ? '0 0 10px rgba(139,92,246,0.22)' : 'none',
                      opacity: active ? 1 : 0.95,
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#7A7F93', letterSpacing: '0.06em' }}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-2 text-xs outline-none transition-colors focus:border-[var(--accent)]"
              style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0', borderRadius: 0 }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={loading} className="flex-1 active:scale-[0.97] hover:border-[#2E2E36]">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!hasActiveFilters} className="flex-1 active:scale-[0.97]">
              <X size={13} /> Clear
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 max-h-[calc(100dvh-220px)]" style={{ scrollbarGutter: 'stable' } as React.CSSProperties}>
          {loading ? (
            <div className="space-y-2">
              <div className="h-20 skeleton" />
              <div className="h-20 skeleton" />
              <div className="h-20 skeleton" />
            </div>
          ) : (
            <>
              <div className="p-3" style={{ background: '#121215', border: '1px solid #232329' }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#7A7F93', letterSpacing: '0.06em' }}>Pagination</span>
                  <span className="text-[11px] tabular-nums" style={{ color: '#5A5E6E' }}>{filtered.length} results</span>
                </div>
                <div className="mb-2 flex items-center justify-between text-xs" style={{ color: '#9FA3B5' }}>
                  <span className="tabular-nums">Page {currentPage} / {totalPages}</span>
                  <span className="text-[11px] px-1.5 py-0.5" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#7A7F93' }}>{pageSize}/page</span>
                </div>
                <div className="mb-2 flex items-center gap-1">
                  <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} className="flex-1 active:scale-[0.97]">
                    <ChevronLeft size={13} /> Prev
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="flex-1 active:scale-[0.97]">
                    Next <ChevronRight size={13} />
                  </Button>
                </div>
                <label className="flex items-center justify-between gap-2 text-xs" style={{ color: '#7A7F93' }}>
                  Per page
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="px-2 py-1 text-xs outline-none"
                    style={{ background: '#0E0E10', border: '1px solid #232329', color: '#E6E8F0', borderRadius: 0 }}
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                {hasActiveFilters && <p className="mt-2 text-xs" style={{ color: '#5A5E6E' }}>{filtered.length} of {deduped.length} deduped entries · filtered</p>}
              </div>

              <div className="p-3 text-xs leading-relaxed" style={{ background: '#070709', border: '1px dashed #232329', color: '#9FA3B5' }}>
                <strong style={{ color: '#E6E8F0' }}>Per-date</strong> groups by <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>Today / Yesterday / date</code>. Deduped by method+URL (×N). Hover list rows for lift.
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main list — only table scrolls, pagination fixed, never entire screen */}
      <section className="flex min-w-0 flex-1 min-h-0 max-h-full flex-col bg-[#070709] overflow-hidden" style={{ maxHeight: '100%' }}>
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{ background: '#0E0E10', borderColor: '#232329' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: '#9FA3B5' }}>
            <span className="hidden sm:inline-flex h-5 w-5 items-center justify-center" style={{ background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.16)', color: '#8B5CF6' }}>
              <HistoryIcon size={11} />
            </span>
            Showing <span className="font-mono font-semibold tabular-nums" style={{ color: '#E6E8F0' }}>{paginated.length}</span> of <span className="font-mono tabular-nums" style={{ color: '#E6E8F0' }}>{filtered.length}</span> {filtered.length === 1 ? 'entry' : 'entries'}
            {hasActiveFilters && <span className="ml-1 px-1.5 py-0.5 text-[11px] font-medium" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>filtered</span>}
          </div>
          <div className="hidden items-center gap-1.5 text-xs sm:flex" style={{ color: '#5A5E6E' }}>
            <Zap size={11} className="opacity-60" /> Click to expand · “Add to workspace” to reopen
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden max-h-full" style={{ background: '#070709', maxHeight: '100%' }}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 max-h-[calc(100dvh-260px)]" style={{ scrollbarGutter: 'stable', maxHeight: 'calc(100dvh - 260px)' } as React.CSSProperties}>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i=>(
                  <div key={i} className="h-[88px] skeleton" />
                ))}
              </div>
            ) : paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center animate-fadeUp">
                <div className="flex h-12 w-12 items-center justify-center" style={{ background: '#121215', border: '1px solid #232329', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                  <Clock size={18} style={{ color: '#5A5E6E' }} />
                </div>
                <p className="mt-3 text-[14px] font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.015em' }}>
                  {items.length === 0 ? 'No history yet' : 'No matches'}
                </p>
                <p className="mt-1 max-w-[36ch] text-[13px] leading-relaxed" style={{ color: '#7A7F93' }}>
                  {items.length === 0 ? 'History appears here automatically after you send requests. Your recent calls, errors and timings — all in one timeline.' : 'Try adjusting filters or search. Clear to see all entries.'}
                </p>
                {items.length === 0 ? (
                  <div className="mt-4 grid w-full max-w-md grid-cols-3 gap-2 opacity-50">
                    <div className="h-12 skeleton" /><div className="h-12 skeleton" /><div className="h-12 skeleton" />
                  </div>
                ) : null}
                {hasActiveFilters && <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-4 active:scale-[0.97]">Clear filters</Button>}
              </div>
            ) : (
              <div className="space-y-4">
                {[...grouped.entries()].map(([dateLabel, rows], groupIdx) => (
                  <div key={dateLabel} className="overflow-hidden" style={{ background: '#0E0E10', border: '1px solid #232329', boxShadow: '0 2px 12px rgba(0,0,0,0.18)', animation: `fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both`, animationDelay: `${groupIdx * 40}ms` }}>
                    <div
                      className="sticky top-0 z-[1] flex items-center gap-2 px-3 py-2 text-xs font-semibold tracking-wide"
                      style={{ background: '#121215', borderBottom: '1px solid #232329', color: '#9FA3B5', letterSpacing: '0.04em' }}
                    >
                      <span className="flex h-5 w-5 items-center justify-center" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#7A7F93' }}>
                        <Calendar size={11} />
                      </span>
                      {dateLabel}
                      <span className="ml-auto font-mono text-[11px] tabular-nums px-1.5 py-0.5" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#7A7F93' }}>{rows.length}</span>
                    </div>
                    <ul className="divide-y" style={{ borderColor: 'rgba(35,35,41,0.6)' }}>
                      {rows.map((row) => {
                        const k = keyOf(row.method, row.url);
                        const isExpanded = expandedKey === k;
                        const raw = rawByKey.get(k);
                        const hasError = !!(row.lastError || raw?.error || row.statusCode == null || (row.statusCode != null && row.statusCode >= 400));
                        return (
                          <li key={`${row.method}-${row.url}-${row.timestamp}`} className="group">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setExpandedKey(isExpanded ? null : k)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedKey(isExpanded ? null : k); } }}
                              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-all duration-200 hover:translate-y-[-1px] active:scale-[0.998] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)] focus-visible:ring-inset"
                              style={{
                                background: isExpanded ? '#121215' : 'transparent',
                                borderLeft: isExpanded ? '2px solid #8B5CF6' : '2px solid transparent',
                              }}
                              title="Click to expand result / error"
                            >
                              <span className="shrink-0 flex h-6 w-6 items-center justify-center transition-colors" style={{ background: isExpanded ? 'rgba(139,92,246,0.12)' : '#121215', border: '1px solid #232329', color: isExpanded ? '#8B5CF6' : '#5A5E6E' }}>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </span>
                              <span className="w-[52px] shrink-0 text-center font-mono text-[11px] font-bold tracking-wide px-1.5 py-1" style={{ background: '#121215', border: '1px solid #232329', color: METHOD_COLORS[row.method as HttpMethod] ?? '#9FA3B5' }}>{row.method}</span>
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.01em' }}>{row.url}</span>
                              {(() => {
                                if (!raw) return null;
                                const rp = (raw as any).requestParams ?? (raw as any).request_params ?? '';
                                const rb = (raw as any).requestBody ?? (raw as any).request_body ?? '';
                                const rh = raw.requestHeaders ?? '';
                                const hasParams = rp && rp !== '[]' && rp !== '' && rp !== 'null';
                                const hasBody = rb && rb !== '' && rb !== '{}';
                                const hasHeaders = rh && rh !== '[]' && rh !== '{}' && rh !== '';
                                if (!hasParams && !hasBody && !hasHeaders) return null;
                                return (
                                  <span className="hidden shrink-0 items-center gap-1 sm:flex">
                                    {hasParams && <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>P</span>}
                                    {hasBody && <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>B</span>}
                                    {hasHeaders && <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>H</span>}
                                  </span>
                                );
                              })()}
                              {row.hits > 1 && <span className="shrink-0 px-1.5 py-0.5 text-[11px] font-mono tabular-nums" style={{ background: '#121215', border: '1px solid #232329', color: '#9FA3B5' }} title={`${row.hits} hits`}>×{row.hits}</span>}
                              <span className="w-10 shrink-0 text-right font-mono text-xs font-semibold tabular-nums" style={{ color: statusColor(row.statusCode), background: '#121215', border: '1px solid #232329', padding: '2px 4px' }}>{row.statusCode ?? '—'}</span>
                              <span className="hidden w-16 shrink-0 text-right font-mono text-xs tabular-nums sm:block" style={{ color: '#7A7F93' }}>{row.responseTime != null ? `${row.responseTime}ms` : '—'}</span>
                              <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums sm:block" style={{ color: '#5A5E6E' }}>{relativeTime(row.timestamp)}</span>
                              <span className="hidden sm:flex shrink-0 items-center gap-1 pl-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const r = rawByKey.get(k);
                                    if (r) setStarTarget(toRequest(r));
                                  }}
                                  className="flex h-7 w-7 items-center justify-center transition-all hover:bg-[#121215] active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
                                  style={{ border: '1px solid #232329', color: '#7A7F93' }}
                                  aria-label="Save to collection"
                                  title="Save to collection"
                                >
                                  <Star size={13} />
                                </button>
                              </span>
                            </div>

                            {isExpanded && raw && (
                              <div className="border-t px-3 py-3 animate-fadeUp" style={{ background: '#070709', borderColor: '#232329' }}>
                                {(raw.error || row.lastError) && (
                                  <div className="mb-3 flex items-start gap-2.5 px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)' }}>
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.28)', color: '#EF4444' }}>
                                      <AlertCircle size={13} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-semibold" style={{ color: '#EF4444' }}>Error</div>
                                      <div className="break-words text-xs leading-relaxed" style={{ color: '#E6E8F0' }}>{raw.error || row.lastError}</div>
                                    </div>
                                  </div>
                                )}

                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                  <span className="px-2.5 py-1 font-mono text-xs font-semibold" style={{ background: '#121215', border: '1px solid #232329', color: statusColor(raw.statusCode) }}>
                                    {raw.statusCode ?? '—'} {raw.statusCode != null ? (raw.statusCode < 300 ? 'OK' : raw.statusCode < 400 ? 'Redirect' : 'Error') : 'No response'}
                                  </span>
                                  {raw.responseTime != null && <span className="text-xs tabular-nums" style={{ color: '#9FA3B5' }}>{raw.responseTime}ms</span>}
                                  <span className="text-xs" style={{ color: '#5A5E6E' }}>{new Date(raw.timestamp).toLocaleString()}</span>
                                  <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium" style={{ background: hasError ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)', border: `1px solid ${hasError ? 'rgba(239,68,68,0.22)' : 'rgba(16,185,129,0.22)'}`, color: hasError ? '#EF4444' : '#10B981' }}>
                                    {hasError ? <AlertCircle size={12} /> : <FileText size={12} />} {hasError ? 'Failed' : 'Success'}
                                  </span>
                                </div>

                                <div className="grid gap-3 lg:grid-cols-2">
                                  <div className="overflow-hidden" style={{ background: '#0E0E10', border: '1px solid #232329' }}>
                                    <div className="px-3 py-2 text-xs font-semibold tracking-wide" style={{ background: '#121215', borderBottom: '1px solid #232329', color: '#9FA3B5', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Request</div>
                                    <div className="space-y-2.5 p-3">
                                      <div className="break-all font-mono text-xs" style={{ color: '#E6E8F0' }}>
                                        <span className="font-bold" style={{ color: METHOD_COLORS[raw.method as HttpMethod] ?? '#E6E8F0' }}>{raw.method}</span>{' '}
                                        <span style={{ color: '#9FA3B5' }}>{raw.url}</span>
                                      </div>
                                      {(() => {
                                        const params = kvListFromJson((raw as any).requestParams ?? (raw as any).request_params ?? '[]');
                                        const enabledParams = params.filter((p) => p.enabled && p.key);
                                        if (enabledParams.length === 0) return null;
                                        return (
                                          <div>
                                            <div className="mb-1.5 text-xs font-medium" style={{ color: '#9FA3B5' }}>Params</div>
                                            <div className="p-2.5 font-mono text-xs space-y-1" style={{ background: '#070709', border: '1px solid #232329' }}>
                                              {enabledParams.map((p) => (
                                                <div key={p.id} className="truncate"><span style={{ color: '#8B5CF6' }}>{p.key}</span>=<span style={{ color: '#E6E8F0' }}>{p.value}</span></div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      {(() => {
                                        const headers = kvListFromJson(raw.requestHeaders || '[]');
                                        const enabled = headers.filter((h) => h.enabled && h.key);
                                        if (enabled.length === 0) return null;
                                        return (
                                          <div>
                                            <div className="mb-1.5 text-xs font-medium" style={{ color: '#9FA3B5' }}>Headers</div>
                                            <div className="p-2.5 font-mono text-xs space-y-1" style={{ background: '#070709', border: '1px solid #232329' }}>
                                              {enabled.map((h) => (
                                                <div key={h.id} className="truncate"><span style={{ color: '#7A7F93' }}>{h.key}:</span> <span style={{ color: '#E6E8F0' }}>{h.value}</span></div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      {(() => {
                                        const body = (raw as any).requestBody ?? (raw as any).request_body ?? '';
                                        const bodyType = (raw as any).requestBodyType ?? (raw as any).request_body_type ?? 'none';
                                        if (!body || bodyType === 'none') return null;
                                        return (
                                          <div>
                                            <div className="mb-1.5 flex items-center gap-2 text-xs font-medium" style={{ color: '#9FA3B5' }}>Body <span className="px-1.5 py-0.5 font-mono text-[11px]" style={{ background: '#121215', border: '1px solid #232329', color: '#7A7F93' }}>{bodyType}</span></div>
                                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-xs" style={{ background: '#070709', border: '1px solid #232329', color: '#E6E8F0' }}>{tryPrettyJson(body)}</pre>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>

                                  <div className="overflow-hidden" style={{ background: '#0E0E10', border: '1px solid #232329' }}>
                                    <div className="flex items-center justify-between px-3 py-2" style={{ background: '#121215', borderBottom: '1px solid #232329' }}>
                                      <span className="text-xs font-semibold tracking-wide" style={{ color: '#9FA3B5', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Response</span>
                                      {raw.responseBody && (
                                        <button
                                          onClick={async () => {
                                            try { await navigator.clipboard.writeText(raw.responseBody); } catch {}
                                          }}
                                          className="flex h-6 w-6 items-center justify-center transition-colors hover:bg-[#070709] active:scale-95"
                                          style={{ border: '1px solid #232329', color: '#7A7F93' }}
                                          title="Copy response"
                                        >
                                          <Copy size={12} />
                                        </button>
                                      )}
                                    </div>
                                    <div className="space-y-2.5 p-3">
                                      {(() => {
                                        let headerEntries: Array<[string,string]> = [];
                                        try {
                                          const parsed = JSON.parse(raw.responseHeaders || '{}');
                                          if (Array.isArray(parsed)) headerEntries = parsed.filter((h:any)=>h.key).map((h:any)=>[h.key, h.value]);
                                          else if (parsed && typeof parsed === 'object') headerEntries = Object.entries(parsed as Record<string,string>);
                                        } catch {}
                                        if (headerEntries.length === 0) return null;
                                        return (
                                          <div>
                                            <div className="mb-1.5 text-xs font-medium" style={{ color: '#9FA3B5' }}>Headers</div>
                                            <div className="max-h-24 overflow-auto p-2.5 font-mono text-xs space-y-1" style={{ background: '#070709', border: '1px solid #232329' }}>
                                              {headerEntries.slice(0, 20).map(([k,v]) => (
                                                <div key={k} className="truncate"><span style={{ color: '#7A7F93' }}>{k}:</span> <span style={{ color: '#E6E8F0' }}>{String(v)}</span></div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      <div>
                                        <div className="mb-1.5 flex items-center justify-between">
                                          <span className="text-xs font-medium" style={{ color: '#9FA3B5' }}>Body</span>
                                          {raw.responseBody && <span className="text-[11px] px-1.5 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#5A5E6E' }}>{raw.responseBody.length} chars</span>}
                                        </div>
                                        {raw.responseBody ? (
                                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-xs" style={{ background: '#070709', border: '1px solid #232329', color: '#E6E8F0' }}>{tryPrettyJson(raw.responseBody)}</pre>
                                        ) : (
                                          <div className="p-2.5 text-xs italic" style={{ background: '#070709', border: '1px dashed #232329', color: '#5A5E6E' }}>Empty response</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap justify-end gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      const r = rawByKey.get(k);
                                      if (r) setStarTarget(toRequest(r));
                                    }}
                                    className="active:scale-[0.97] hover:border-[#2E2E36]"
                                  >
                                    <Star size={13} /> Save to collection
                                  </Button>
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => open(row)}
                                    className="active:scale-[0.97]"
                                  >
                                    <ExternalLink size={13} /> Add to workspace
                                  </Button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination — stuck to bottom, always visible, only table scrolls */}
          <div
            className="shrink-0 sticky bottom-0 z-10 mt-auto flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            style={{ background: '#0E0E10', borderTop: '1px solid #232329', boxShadow: '0 -4px 16px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.03)' }}
          >
            {filtered.length > pageSize ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" onClick={() => { setPage((p) => Math.max(1, p - 1)); document.querySelector('.flex-1.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentPage <= 1} className="active:scale-[0.97]">
                    <ChevronLeft size={13} /> Prev
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let n: number;
                    if (totalPages <= 5) n = i + 1;
                    else if (currentPage <= 3) n = i + 1;
                    else if (currentPage >= totalPages - 2) n = totalPages - 4 + i;
                    else n = currentPage - 2 + i;
                    return (
                      <button
                        key={n}
                        onClick={() => { setPage(n); document.querySelector('.flex-1.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="h-7 w-7 text-xs font-mono font-medium tabular-nums transition-all active:scale-[0.96]"
                        style={{
                          background: n === currentPage ? '#8B5CF6' : '#121215',
                          color: n === currentPage ? '#FFFFFF' : '#7A7F93',
                          border: n === currentPage ? '1px solid #8B5CF6' : '1px solid #232329',
                          borderRadius: 0,
                          boxShadow: n === currentPage ? '0 0 10px rgba(139,92,246,0.28)' : 'none',
                        }}
                        aria-current={n === currentPage ? 'page' : undefined}
                        aria-label={`Page ${n}`}
                      >
                        {n}
                      </button>
                    );
                  })}
                  {totalPages > 5 && <span className="px-1 text-xs" style={{ color: '#5A5E6E' }}>… {totalPages}</span>}
                  <Button variant="secondary" size="sm" onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); document.querySelector('.flex-1.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentPage >= totalPages} className="active:scale-[0.97]">
                    Next <ChevronRight size={13} />
                  </Button>
                </div>
                <span className="hidden lg:inline text-xs tabular-nums" style={{ color: '#5A5E6E' }}>
                  {paginated.length} of {filtered.length} · page {currentPage}/{totalPages}
                </span>
              </div>
            ) : (
              <span className="text-xs tabular-nums" style={{ color: '#5A5E6E' }}>
                {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} · {paginated.length} shown
              </span>
            )}
            <p className="flex items-center gap-2 text-xs" style={{ color: '#5A5E6E' }}>
              <Sparkles size={11} className="opacity-60 hidden sm:inline" />
              <span className="hidden sm:inline">Merged ×N · click to expand · “Add to workspace” reopens · star to save</span>
              <span className="sm:hidden">×N merged · tap to expand</span>
            </p>
          </div>
        </div>
      </section>

      <SaveToCollectionModal open={starTarget !== null} onClose={() => setStarTarget(null)} request={starTarget} />
    </div>
  );
}
