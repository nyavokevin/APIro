import { useMemo, useState } from 'react';
import { Beaker, Layers, Plus, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Filter } from 'lucide-react';
import type { ScannedRoute } from '@shared/types/scanner';
import { computeCoverage, pathToFolder } from '../../lib/scanner/testCoverage';
import { Button } from '../ui/Button';
import { useCollectionStore } from '../../stores/collectionStore';
import { useRequestStore } from '../../stores/requestStore';
import { uid } from '../../lib/id';
import type { RequestData } from '@shared/types/request';
import { METHOD_COLORS } from '@shared/constants/methods';

function methodColor(m: string): string {
  return (METHOD_COLORS as Record<string, string>)[m as keyof typeof METHOD_COLORS] ?? '#9FA3B5';
}

interface Props {
  routes: ScannedRoute[];
  baseUrl: string;
}

export function CoveragePanel({ routes, baseUrl }: Props) {
  const collections = useCollectionStore((s) => s.collections);
  const requests = useMemo(() => {
    const all: RequestData[] = [];
    const walk = (nodes: typeof collections) => {
      for (const n of nodes) {
        if (n.type === 'request' && n.data) all.push(n.data);
        if (n.children) walk(n.children as typeof collections);
      }
    };
    walk(collections);
    return all;
  }, [collections]);

  const coverage = useMemo(() => computeCoverage(routes, requests), [routes, requests]);
  const [showUncovered, setShowUncovered] = useState(true);
  const [filterFolder, setFilterFolder] = useState<string>('all');

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const r of coverage.uncovered) set.add(pathToFolder(r.path));
    return ['all', ...Array.from(set).sort()];
  }, [coverage.uncovered]);

  const filteredUncovered = useMemo(() => {
    if (filterFolder === 'all') return coverage.uncovered;
    return coverage.uncovered.filter((r) => pathToFolder(r.path) === filterFolder);
  }, [coverage.uncovered, filterFolder]);

  const createRequest = (route: ScannedRoute) => {
    const pathFilled = route.path.replace(/\{[^}]+\}/g, '123').replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '123');
    const url = `${baseUrl.replace(/\/$/, '')}${pathFilled.startsWith('/') ? pathFilled : `/${pathFilled}`}`;
    const req: RequestData = {
      id: uid(),
      name: `${route.method} ${route.path}`,
      method: route.method as RequestData['method'],
      url,
      headers: route.authRequired ? [{ id: uid(), key: 'Authorization', value: 'Bearer {{authToken}}', enabled: true }] : [],
      params: route.params.filter(p => p.location !== 'path').map(p => ({ id: uid(), key: p.name, value: 'example', enabled: true })),
      bodyType: ['POST','PUT','PATCH'].includes(route.method) ? 'json' : 'none',
      body: ['POST','PUT','PATCH'].includes(route.method) ? '{\n  "id": 123\n}' : '',
      auth: { type: 'none' },
    };
    useRequestStore.getState().openRequest(req);
  };

  return (
    <div className="overflow-hidden animate-fadeUp" style={{ background: '#0E0E10', border: '1px solid #232329', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
      <div className="px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.22)', color: '#10B981' }}>
            <Beaker size={13} />
          </span>
          <span className="text-sm font-semibold" style={{ color: '#E6E8F0' }}>Test Coverage</span>
          <span className="ml-auto text-xs font-mono tabular-nums px-1.5 py-0.5" style={{ background: coverage.coveragePercent >= 80 ? 'rgba(16,185,129,0.12)' : coverage.coveragePercent >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${coverage.coveragePercent >= 80 ? 'rgba(16,185,129,0.22)' : coverage.coveragePercent >= 50 ? 'rgba(245,158,11,0.22)' : 'rgba(239,68,68,0.22)'}`, color: coverage.coveragePercent >= 80 ? '#10B981' : coverage.coveragePercent >= 50 ? '#F59E0B' : '#EF4444' }}>
            {coverage.covered.length}/{coverage.total} ({coverage.coveragePercent}%)
          </span>
        </div>

        <div className="mt-2.5 h-2 w-full overflow-hidden" style={{ background: '#070709', border: '1px solid #232329' }}>
          <div className="h-full transition-all duration-500" style={{ width: `${coverage.coveragePercent}%`, background: coverage.coveragePercent >= 80 ? '#10B981' : coverage.coveragePercent >= 50 ? '#F59E0B' : '#EF4444', boxShadow: '0 0 8px currentColor' }} />
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: coverage.uncovered.length === 0 ? '#10B981' : '#9FA3B5' }}>
          {coverage.uncovered.length === 0 ? (
            <><CheckCircle2 size={12} style={{ color: '#10B981' }} /> All routes covered</>
          ) : (
            <><AlertCircle size={12} style={{ color: '#F59E0B' }} /> {coverage.uncovered.length} routes have no associated request</>
          )}
          <button onClick={() => setShowUncovered(v => !v)} className="ml-auto inline-flex items-center gap-1 text-xs hover:underline" style={{ color: '#8B5CF6' }}>
            {showUncovered ? <><ChevronUp size={12} /> Hide</> : <><ChevronDown size={12} /> View uncovered</>}
          </button>
        </div>
      </div>

      {showUncovered && coverage.uncovered.length > 0 && (
        <div className="border-t" style={{ borderColor: '#232329', background: '#070709' }}>
          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: '#0E0E10', borderColor: '#232329' }}>
            <Filter size={12} style={{ color: '#7A7F93' }} />
            <span className="text-xs" style={{ color: '#7A7F93' }}>Filter by folder</span>
            <select value={filterFolder} onChange={(e) => setFilterFolder(e.target.value)} className="ml-auto text-xs px-2 py-1 outline-none" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>
              {folders.map(f => <option key={f} value={f}>{f === 'all' ? 'All folders' : f}</option>)}
            </select>
          </div>

          <div className="max-h-[280px] overflow-auto p-2 space-y-1">
            {filteredUncovered.map((r) => (
              <div key={`${r.method}:${r.path}:${r.file}:${r.line}`} className="flex items-center gap-2.5 px-3 py-2 group hover:bg-[#0E0E10] transition-colors" style={{ background: '#121215', border: '1px solid #232329' }}>
                <span className="w-[56px] shrink-0 text-center font-mono text-[11px] font-bold tracking-wide px-1 py-1" style={{ background: '#0E0E10', border: '1px solid #232329', color: methodColor(r.method) }}>{r.method}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium" style={{ color: '#E6E8F0' }} title={r.path}>{r.path}</span>
                <span className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-medium items-center gap-1" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#9FA3B5' }}>
                  <Layers size={9} /> {pathToFolder(r.path)}
                </span>
                <Button variant="secondary" size="sm" onClick={() => createRequest(r)} className="shrink-0 active:scale-[0.97] ml-auto">
                  <Plus size={11} /> Create request
                </Button>
              </div>
            ))}
            {filteredUncovered.length === 0 && (
              <p className="py-6 text-center text-xs" style={{ color: '#7A7F93' }}>No uncovered routes in "{filterFolder}"</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
