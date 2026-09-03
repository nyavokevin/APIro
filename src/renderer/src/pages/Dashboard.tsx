import { useMemo, useState, useEffect } from 'react';
import { LayoutGrid, List, ChevronLeft, ChevronRight, Boxes, PlugZap, Database, Cloud, CreditCard, MessageCircle, MapPin, Shield } from 'lucide-react';
import { SearchBar } from '../components/inputs/SearchBar';
import { Dropdown } from '../components/inputs/Dropdown';
import { ApiCard } from '../components/cards/ApiCard';
import { useCollectionStore } from '../stores/collectionStore';
import { useUiStore } from '../stores/uiStore';
import { useRequestStore } from '../stores/requestStore';

type ViewMode = 'grid' | 'list';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'payment', label: 'Payment' },
  { value: 'communication', label: 'Communication' },
  { value: 'maps', label: 'Maps & Location' },
  { value: 'data', label: 'Data & Storage' },
  { value: 'auth', label: 'Auth' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'trial', label: 'Trial' },
];

const ITEMS_PER_PAGE = 8;

const LOGO_COLORS = ['#EF4444', '#3B82F6', '#FFFFFF', '#FBBF24', '#10B981', '#52525B', '#8B5CF6', '#F97316'];
const LOGO_ICONS = [CreditCard, MessageCircle, MapPin, Database, Cloud, Boxes, Shield, PlugZap] as const;

interface DashboardItem {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  status: 'active' | 'trial';
  logoColor: string;
  logoText: string;
  requests: number;
  updatedAt: string;
}

function buildDashboardItems(collections: ReturnType<typeof useCollectionStore.getState>['collections']): DashboardItem[] {
  if (collections.length === 0) {
    // Demo seed when empty — matches reference design density
    const demo: DashboardItem[] = [
      { id: 'demo-1', title: 'Stripe Payments', subtitle: 'stripe.com/api', category: 'payment', status: 'active', logoColor: '#635BFF', logoText: 'ST', requests: 24, updatedAt: '2 hours ago' },
      { id: 'demo-2', title: 'Twilio Messaging', subtitle: 'twilio.com/api', category: 'communication', status: 'active', logoColor: '#F22F46', logoText: 'TW', requests: 18, updatedAt: '5 hours ago' },
      { id: 'demo-3', title: 'Google Maps', subtitle: 'maps.googleapis.com', category: 'maps', status: 'trial', logoColor: '#4285F4', logoText: 'GM', requests: 32, updatedAt: '1 day ago' },
      { id: 'demo-4', title: 'Supabase DB', subtitle: 'supabase.co/rest', category: 'data', status: 'active', logoColor: '#3ECF8E', logoText: 'SB', requests: 15, updatedAt: '3 hours ago' },
      { id: 'demo-5', title: 'Auth0 Identity', subtitle: 'auth0.com/api', category: 'auth', status: 'active', logoColor: '#EB5424', logoText: 'A0', requests: 9, updatedAt: '6 hours ago' },
      { id: 'demo-6', title: 'Cloudinary Media', subtitle: 'api.cloudinary.com', category: 'data', status: 'trial', logoColor: '#3448C5', logoText: 'CL', requests: 11, updatedAt: '1 day ago' },
      { id: 'demo-7', title: 'SendGrid Email', subtitle: 'api.sendgrid.com', category: 'communication', status: 'active', logoColor: '#1A82E2', logoText: 'SG', requests: 27, updatedAt: '4 hours ago' },
      { id: 'demo-8', title: 'Mapbox Tiles', subtitle: 'api.mapbox.com', category: 'maps', status: 'active', logoColor: '#4264FB', logoText: 'MB', requests: 14, updatedAt: '8 hours ago' },
    ];
    return demo;
  }

  return collections.map((c, idx) => {
    const count = countRequests(c);
    const category = (['payment', 'communication', 'maps', 'data', 'auth'] as const)[idx % 5];
    const status = idx % 3 === 0 ? 'trial' as const : 'active' as const;
    return {
      id: c.id,
      title: c.name,
      subtitle: c.description || `${count} requests • ${category}`,
      category,
      status,
      logoColor: LOGO_COLORS[idx % LOGO_COLORS.length],
      logoText: c.name.slice(0, 2).toUpperCase(),
      requests: count,
      updatedAt: 'Updated now',
    };
  });
}

function countRequests(node: { type: string; children?: unknown[] }): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = node as any;
  if (n.type === 'request') return 1;
  let c = 0;
  for (const child of n.children ?? []) c += countRequests(child as never);
  return c;
}

export function Dashboard() {
  const { collections, load } = useCollectionStore();
  const setActivePage = useUiStore((s) => s.setActivePage);
  const openRequest = useRequestStore((s) => s.openRequest);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (collections.length === 0) void load();
  }, [collections.length, load]);

  const items = useMemo(() => buildDashboardItems(collections), [collections]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (q && !it.title.toLowerCase().includes(q) && !it.subtitle.toLowerCase().includes(q)) return false;
      if (category !== 'all' && it.category !== category) return false;
      if (status !== 'all' && it.status !== status) return false;
      return true;
    });
  }, [items, search, category, status]);

  // reset pagination when filters change
  useEffect(() => { setPage(1); }, [search, category, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const handleCardClick = (id: string) => {
    // If demo item, go to workspace with a fresh tab; if real collection, open first request
    const col = collections.find((c) => c.id === id);
    if (!col) {
      setActivePage('workspace');
      useRequestStore.getState().openRequest();
      return;
    }
    if (col.type === 'request' && col.data) {
      openRequest(col.data);
      setActivePage('workspace');
      return;
    }
    // folder: open first child request if exists, else go to collections page with selection
    const firstReq = findFirstRequest(col) as import('@shared/types/request').RequestData | null;
    if (firstReq) {
      openRequest(firstReq);
      setActivePage('workspace');
    } else {
      setActivePage('collections');
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#000000] overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-3 bg-[#000000] shrink-0"
        style={{ padding: '24px 32px 16px 32px', borderBottom: '1px solid #262626' }}
      >
        {/* Search */}
        <div className="min-w-[280px] flex-1 max-w-[420px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Search APIs…" />
        </div>

        <div className="flex items-center gap-3">
          <Dropdown value={category} options={CATEGORY_OPTIONS} onChange={setCategory} minWidth={160} />
          <Dropdown value={status} options={STATUS_OPTIONS} onChange={setStatus} minWidth={140} />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-[#8F909E] md:inline">
            {filtered.length} {filtered.length === 1 ? 'API' : 'APIs'}
          </span>
          {/* View Toggle */}
          <div
            className="inline-flex items-center bg-[#121212]"
            style={{ border: '1px solid #262626', padding: '4px', borderRadius: '0px' }}
            role="group"
            aria-label="View mode"
          >
            <button
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              aria-label="Grid view"
              className="flex items-center justify-center"
              style={{
                padding: '6px',
                borderRadius: '0px',
                background: view === 'grid' ? '#8B5CF6' : 'transparent',
                color: view === 'grid' ? '#FFFFFF' : '#8F909E',
                border: 'none',
              }}
            >
              <LayoutGrid size={16} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              aria-label="List view"
              className="flex items-center justify-center"
              style={{
                padding: '6px',
                borderRadius: '0px',
                background: view === 'list' ? '#8B5CF6' : 'transparent',
                color: view === 'list' ? '#FFFFFF' : '#8F909E',
                border: 'none',
              }}
            >
              <List size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" style={{ padding: '24px 32px' }}>
        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center bg-[#121212]" style={{ border: '1px solid #262626' }}>
              <Boxes size={20} className="text-[#8F909E]" />
            </div>
            <p className="text-sm font-medium text-[#E2E8F0]">No APIs found</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#8F909E]">
              Try adjusting your search or filters. Create a collection or import an OpenAPI file to populate your library.
            </p>
          </div>
        ) : view === 'grid' ? (
          <>
            <style>{`
              .apiro-grid { display: grid; gap: 24px; grid-template-columns: repeat(4, minmax(0,1fr)); }
              @media (max-width: 1024px) { .apiro-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; } }
              @media (max-width: 768px) { .apiro-grid { grid-template-columns: repeat(1, minmax(0,1fr)) !important; } }
            `}</style>
            <div className="apiro-grid">
              {paged.map((item, idx) => {
                const Icon = LOGO_ICONS[idx % LOGO_ICONS.length];
                return (
                  <ApiCard
                    key={item.id}
                    title={item.title}
                    subtitle={item.subtitle}
                    logoColor={item.logoColor}
                    logoText={item.logoText}
                    icon={<Icon size={22} strokeWidth={1.75} />}
                    status={item.status}
                    stats={[
                      { label: 'Requests', value: String(item.requests) },
                      { label: 'Category', value: item.category },
                    ]}
                    onClick={() => handleCardClick(item.id)}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
            {/* List header */}
            <div
              className="hidden items-center gap-4 bg-[#121212] px-4 py-3 text-xs uppercase tracking-wider text-[#8F909E] md:flex"
              style={{ borderBottom: '1px solid #262626' }}
            >
              <span className="w-12" />
              <span className="flex-1">Name</span>
              <span className="w-24">Status</span>
              <span className="w-20 text-right">Requests</span>
            </div>
            {paged.map((item, idx) => {
              const Icon = LOGO_ICONS[idx % LOGO_ICONS.length];
              return (
                <button
                  key={item.id}
                  onClick={() => handleCardClick(item.id)}
                  className="flex items-center gap-4 bg-[#121212] px-4 py-3 text-left hover:bg-[#1A1A1A]"
                  style={{ borderBottom: '1px solid #262626' }}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center"
                    style={{ background: item.logoColor, borderRadius: '0px' }}
                  >
                    <Icon size={16} className={item.logoColor === '#FFFFFF' ? 'text-black' : 'text-white'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#E2E8F0]">{item.title}</span>
                    <span className="block truncate text-xs text-[#8F909E]">{item.subtitle}</span>
                  </span>
                  <span
                    className="w-24 shrink-0 text-xs font-medium capitalize"
                    style={{
                      padding: '4px 8px',
                      background: item.status === 'active' ? 'rgba(16,185,129,0.10)' : 'rgba(148,163,184,0.10)',
                      color: item.status === 'active' ? '#10B981' : '#94A3B8',
                      borderRadius: '0px',
                      textAlign: 'center',
                    }}
                  >
                    {item.status}
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs text-[#E2E8F0]">{item.requests}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {filtered.length > ITEMS_PER_PAGE && (
          <div className="mt-8 flex items-center justify-between">
            <span className="text-xs text-[#8F909E]">
              Page {page} of {totalPages} · {filtered.length} total
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 bg-[#121212] px-3 py-1.5 text-xs font-medium text-[#E2E8F0] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1A1A1A]"
                style={{ border: '1px solid #262626', borderRadius: '0px' }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
                  .map((n) => (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className="h-8 w-8 text-xs font-medium"
                      style={{
                        background: n === page ? '#8B5CF6' : '#121212',
                        color: n === page ? '#FFFFFF' : '#8F909E',
                        border: n === page ? '1px solid #8B5CF6' : '1px solid #262626',
                        borderRadius: '0px',
                      }}
                    >
                      {n}
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 bg-[#121212] px-3 py-1.5 text-xs font-medium text-[#E2E8F0] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1A1A1A]"
                style={{ border: '1px solid #262626', borderRadius: '0px' }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function findFirstRequest(node: { type: string; data?: unknown; children?: unknown[] }): unknown | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = node as any;
  if (n.type === 'request') return n.data ?? null;
  for (const c of n.children ?? []) {
    const found = findFirstRequest(c as never);
    if (found) return found;
  }
  return null;
}
