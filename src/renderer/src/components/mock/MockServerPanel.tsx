import { useEffect, useState } from 'react';
import { Plus, Play, Square, Trash2, History, Server, Route, Database, FileJson, Bot, Copy, Download, RefreshCw, Settings2, Layers, Radio, Zap, Globe, Box } from 'lucide-react';
import type { MockServer, MockRoute } from '@shared/types/request';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { isTauri } from '../../services/tauri';

const METHODS: MockRoute['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'GRAPHQL'];

function newRoute(): MockRoute {
  return {
    id: Math.random().toString(36).slice(2),
    method: 'GET',
    path: '/',
    status: 200,
    body: '{}',
    delay: 0,
    headers: {},
    variants: [],
    state: null,
  };
}

type ServerTab = 'routes' | 'hits' | 'state' | 'spec' | 'mcp';

export function MockServerPanel() {
  const [servers, setServers] = useState<MockServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [port, setPort] = useState('3001');
  const [mode, setMode] = useState<MockServer['mode']>('mock');
  const [targetUrl, setTargetUrl] = useState('http://localhost:3000');
  const [mocksDir, setMocksDir] = useState('');
  const [stateEnabled, setStateEnabled] = useState(false);
  const [graphqlEnabled, setGraphqlEnabled] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, ServerTab>>({});
  const [error, setError] = useState<string | null>(null);
  const [specInput, setSpecInput] = useState('');
  const [specGenerating, setSpecGenerating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.mockServer.list();
      setServers(list);
    } catch (err) {
      try {
        const list2 = await (api.mockServer as any).listV2?.();
        if (Array.isArray(list2)) setServers(list2);
      } catch {}
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    const p = parseInt(port, 10);
    if (Number.isNaN(p) || p < 1 || p > 65535) { setError('Port must be 1-65535.'); return; }
    try {
      const srv = await api.mockServer.create({
        name: name.trim(),
        port: p,
        routes: [],
        mode: mode as any,
        targetUrl: mode === 'mock' ? null : targetUrl || null,
        stateEnabled,
        mocksDir: mocksDir || null,
        graphqlEnabled,
      } as any);
      setServers((prev) => [...prev, srv]);
      setName(''); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const start = async (id: string) => {
    try {
      const srv = await api.mockServer.start(id);
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...srv, running: true } as any : s)));
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const stop = async (id: string) => {
    try {
      const srv = await api.mockServer.stop(id);
      setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...srv, running: false } as any : s)));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const removeServer = async (id: string) => {
    try {
      try { await (api.mockServer as any).delete?.(id); } catch {}
      setServers((prev) => prev.filter((s) => s.id !== id));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const updateRoutes = async (id: string, routes: MockRoute[]) => {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, routes } : s)));
    try {
      const srv = servers.find(s => s.id === id);
      if (srv) await (api.mockServer as any).update?.({ ...srv, routes });
    } catch {}
  };

  const generateFromSpec = async (serverId: string) => {
    if (!specInput.trim()) { setError('Paste OpenAPI JSON/YAML or a file path.'); return; }
    setSpecGenerating(serverId);
    setError(null);
    try {
      let specContent = specInput.trim();
      if (isTauri() && (specContent.endsWith('.json') || specContent.endsWith('.yaml') || specContent.endsWith('.yml')) && !specContent.trimStart().startsWith('{')) {
        try {
          const { readTextFile } = await import('@tauri-apps/plugin-fs');
          specContent = await readTextFile(specContent);
        } catch {}
      }
      const res = await (api.mockServer as any).generateFromOpenapi?.(specContent, undefined, true, undefined);
      const routes: MockRoute[] = (res?.routes ?? res ?? []) as any;
      if (Array.isArray(routes) && routes.length > 0) {
        const srv = servers.find(s => s.id === serverId);
        const merged = [...(srv?.routes ?? []), ...routes];
        const seen = new Set<string>();
        const deduped = merged.filter(r => {
          const k = `${r.method}:${r.path}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        await updateRoutes(serverId, deduped);
        setError(null);
      }
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setSpecGenerating(null); }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#070709]">
      <div className="flex items-center gap-3 shrink-0 px-4 py-3" style={{ background: '#070709', borderBottom: '1px solid #232329' }}>
        <span className="flex h-8 w-8 items-center justify-center bg-[rgba(139,92,246,0.12)] text-[#8B5CF6]" style={{ border: '1px solid rgba(139,92,246,0.22)' }}>
          <Server size={15} strokeWidth={1.8} />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-[#E6E8F0]" style={{ letterSpacing: '-0.01em' }}>Mock Server v2</h2>
        <span className="ml-1 hidden items-center gap-1.5 bg-[#121215] px-2 py-1 font-mono text-xs tabular-nums text-[#7A7F93] sm:inline-flex" style={{ border: '1px solid #232329' }}>
          <Box size={11} /> spec-driven · stateful · proxy/record · MCP
        </span>
        <Button variant="ghost" size="sm" onClick={() => void load()} className="ml-auto hover:-translate-y-[1px] active:translate-y-0">
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>

      <div className="shrink-0 p-4" style={{ background: '#0E0E10', borderBottom: '1px solid #232329' }}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Local API mock" className="sm:col-span-2" />
          <Input label="Port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="3001" />
          <label className="flex flex-col gap-1.5 text-xs font-medium tracking-wide text-[#9FA3B5]" style={{ letterSpacing: '0.02em' }}>
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="bg-[#121215] px-3 text-xs font-medium text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.12)]"
              style={{ border: '1px solid #232329', height: '40px' }}
            >
              <option value="mock">mock</option>
              <option value="proxy">proxy</option>
              <option value="record">record</option>
            </select>
          </label>
          <Input label="Target URL (proxy/record)" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="http://localhost:3000" className="sm:col-span-2" />
          <Input label="Mocks dir (optional)" value={mocksDir} onChange={(e) => setMocksDir(e.target.value)} placeholder="~/APIForge/mocks/my-mock" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-[#9FA3B5] hover:text-[#E6E8F0] transition-colors">
            <input type="checkbox" checked={stateEnabled} onChange={(e) => setStateEnabled(e.target.checked)} className="h-3.5 w-3.5 accent-[#8B5CF6]" />
            <span className="inline-flex items-center gap-1"><Database size={12} className="text-[#7A7F93]" /> Stateful (SQLite)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 font-medium text-[#9FA3B5] hover:text-[#E6E8F0] transition-colors">
            <input type="checkbox" checked={graphqlEnabled} onChange={(e) => setGraphqlEnabled(e.target.checked)} className="h-3.5 w-3.5 accent-[#8B5CF6]" />
            <span className="inline-flex items-center gap-1"><Globe size={12} className="text-[#7A7F93]" /> GraphQL (operation name)</span>
          </label>
          <span className="ml-auto hidden font-mono text-xs tabular-nums text-[#5A5E6E] lg:inline">
            YAML: one <code className="bg-[#121215] px-1 py-0.5 text-[#8B5CF6]" style={{ border: '1px solid #232329' }}>*.mock.yaml</code> per route · <code className="bg-[#121215] px-1 py-0.5" style={{ border: '1px solid #232329' }}>apiforge mock --file ./mocks --port 3001 --mode record</code>
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={create} className="hover:-translate-y-[1px] hover:shadow-[0_6px_16px_rgba(139,92,246,0.28)] active:translate-y-0">
            <Plus size={14} /> Create server
          </Button>
          {error && (
            <span className="inline-flex items-center gap-1.5 bg-[rgba(239,68,68,0.10)] px-2.5 py-1.5 text-xs font-medium text-[#EF4444] animate-fadeUp" style={{ border: '1px solid rgba(239,68,68,0.20)' }}>
              {error}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-[#7A7F93]">
            <LoaderDots />
            Loading mock servers…
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center animate-fadeUp" style={{ border: '1px dashed #232329', background: '#0E0E10' }}>
            <div className="flex h-12 w-12 items-center justify-center bg-[#121215] text-[#7A7F93]" style={{ border: '1px solid #232329' }}>
              <Server size={20} strokeWidth={1.5} />
            </div>
            <p className="text-sm font-semibold tracking-tight text-[#E6E8F0]">No mock servers yet</p>
            <p className="mx-auto max-w-lg text-xs leading-relaxed text-[#7A7F93]">
              Create one above, or <span className="font-medium text-[#8B5CF6]">Generate from OpenAPI</span> in a server&apos;s Spec tab. Each route is a <code className="bg-[#121215] px-1 py-0.5 font-mono text-[#E6E8F0]" style={{ border: '1px solid #232329' }}>* .mock.yaml</code> — git-diffable, offline, no cloud.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((srv, idx) => {
              const isExpanded = expanded === srv.id;
              const tab = activeTab[srv.id] ?? 'routes';
              const isRunning = !!(srv as any).running;
              return (
                <div
                  key={srv.id}
                  className="group overflow-hidden bg-[#121215] transition-all duration-200 hover:-translate-y-[1px] hover:border-[#2E2E36] hover:shadow-[0_8px_24px_rgba(0,0,0,0.25)] animate-fadeUp"
                  style={{ border: '1px solid #232329', animationDelay: `${idx * 32}ms` }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ background: isExpanded ? '#0E0E10' : '#121215', borderBottom: isExpanded ? '1px solid #1E1E24' : 'none' }}>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : srv.id)}
                        className="flex h-7 w-7 items-center justify-center bg-[#070709] text-[#7A7F93] hover:bg-[#1E1E24] hover:text-[#E6E8F0] active:scale-[0.96] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)]"
                        style={{ border: '1px solid #232329' }}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <Route size={14} className={isExpanded ? 'text-[#8B5CF6]' : ''} />
                      </button>
                      <span className="text-sm font-semibold tracking-tight text-[#E6E8F0]">{srv.name}</span>
                      <span className="inline-flex items-center gap-1.5 bg-[#070709] px-2 py-1 font-mono text-xs font-semibold tabular-nums text-[#9FA3B5]" style={{ border: '1px solid #232329' }}>
                        <Radio size={11} className="text-[#7A7F93]" /> :{srv.port}
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold tabular-nums"
                        style={{
                          background: isRunning ? 'rgba(16,185,129,0.12)' : '#070709',
                          color: isRunning ? '#10B981' : '#7A7F93',
                          border: `1px solid ${isRunning ? 'rgba(16,185,129,0.22)' : '#232329'}`,
                        }}
                      >
                        <span className="relative flex h-2 w-2">
                          {isRunning && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10B981] opacity-50" />}
                          <span className={`relative inline-flex h-2 w-2 rounded-full ${isRunning ? 'animate-pulse bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-[#232329]'}`} />
                        </span>
                        {isRunning ? 'running' : 'stopped'}
                      </span>
                      <span className="hidden bg-[#070709] px-2 py-1 font-mono text-xs font-medium tabular-nums text-[#7A7F93] sm:inline-flex" style={{ border: '1px solid #232329' }}>
                        {(srv as any).mode ?? 'mock'}
                      </span>
                      {(srv as any).stateEnabled && (
                        <span className="hidden items-center gap-1 bg-[rgba(139,92,246,0.12)] px-2 py-1 text-xs font-medium text-[#8B5CF6] sm:inline-flex" style={{ border: '1px solid rgba(139,92,246,0.22)' }}>
                          <Database size={11} /> stateful
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isRunning ? (
                        <Button size="sm" variant="secondary" onClick={() => stop(srv.id)} className="hover:border-[rgba(239,68,68,0.30)] hover:text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)] active:scale-[0.98]">
                          <Square size={12} className="fill-current" /> Stop
                        </Button>
                      ) : (
                        <Button size="sm" variant="primary" onClick={() => start(srv.id)} className="hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(139,92,246,0.28)] active:translate-y-0">
                          <Play size={12} /> Start
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => removeServer(srv.id)} className="hover:text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)] active:scale-[0.96]">
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <>
                      <div className="flex flex-wrap gap-1 px-2 py-2" style={{ background: '#0E0E10', borderTop: '1px solid #232329', borderBottom: '1px solid #232329' }}>
                        {(['routes', 'hits', 'state', 'spec', 'mcp'] as ServerTab[]).map((t) => (
                          <button
                            key={t}
                            onClick={() => setActiveTab((prev) => ({ ...prev, [srv.id]: t }))}
                            className={`px-3 py-1.5 text-xs font-medium capitalize tracking-wide transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)] ${tab === t ? 'bg-[#8B5CF6] text-white shadow-[0_2px_8px_rgba(139,92,246,0.30)]' : 'bg-[#121215] text-[#7A7F93] hover:bg-[#1E1E24] hover:text-[#E6E8F0] hover:border-[#2E2E36]'}`}
                            style={{ border: `1px solid ${tab === t ? '#8B5CF6' : '#232329'}` }}
                          >
                            {t}
                          </button>
                        ))}
                        <span className="ml-auto hidden items-center gap-1.5 font-mono text-xs tabular-nums text-[#7A7F93] sm:inline-flex">
                          <Settings2 size={11} /> {srv.routes.length} route{srv.routes.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="p-4" style={{ background: '#121215' }}>
                        {tab === 'routes' && <RouteEditor routes={srv.routes} onChange={(routes) => updateRoutes(srv.id, routes)} />}
                        {tab === 'hits' && <HitLogPanel serverId={srv.id} />}
                        {tab === 'state' && <StatePanel serverId={srv.id} />}
                        {tab === 'spec' && (
                          <div className="space-y-3 animate-fadeUp">
                            <div>
                              <label className="mb-1.5 block text-xs font-medium tracking-wide text-[#9FA3B5]" style={{ letterSpacing: '0.02em' }}>
                                OpenAPI spec (paste JSON/YAML or file path)
                              </label>
                              <textarea
                                value={specInput}
                                onChange={(e) => setSpecInput(e.target.value)}
                                placeholder={`{"openapi":"3.0.0","info":{"title":"My API"},"paths":{"/users":{"get":{"responses":{"200":{"description":"ok"}}}}}}`}
                                rows={6}
                                className="w-full bg-[#070709] p-3 font-mono text-xs leading-relaxed text-[#E6E8F0] placeholder:text-[#5A5E6E] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.12)]"
                                style={{ border: '1px solid #232329' }}
                              />
                              <div className="mt-2.5 flex gap-2">
                                <Button size="sm" variant="primary" onClick={() => generateFromSpec(srv.id)} disabled={specGenerating === srv.id} className="hover:-translate-y-[1px] active:translate-y-0">
                                  <FileJson size={12} /> {specGenerating === srv.id ? 'Generating…' : 'Generate mocks from spec'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={async () => {
                                    if (!isTauri()) { setError('File picker requires Tauri'); return; }
                                    const { open } = await import('@tauri-apps/plugin-dialog');
                                    const sel = (await open({ filters: [{ name: 'OpenAPI', extensions: ['json', 'yaml', 'yml'] }] })) as string | null;
                                    if (sel) {
                                      try {
                                        const { readTextFile } = await import('@tauri-apps/plugin-fs');
                                        const txt = await readTextFile(sel);
                                        setSpecInput(txt);
                                      } catch (e) { setError(String(e)); }
                                    }
                                  }}
                                  className="hover:-translate-y-[1px] hover:border-[#2E2E36] active:translate-y-0"
                                >
                                  Pick file…
                                </Button>
                              </div>
                              <p className="mt-2 text-xs leading-relaxed text-[#7A7F93]">
                                Generates realistic bodies via Faker (email/uuid/date/price), variants (success/validation-error/server-error/empty-list), and stateful hints. Re-import shows diff (added/changed/removed) — never silent overwrite.
                              </p>
                            </div>
                          </div>
                        )}
                        {tab === 'mcp' && <McpPanel serverId={srv.id} />}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LoaderDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8B5CF6]" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8B5CF6]" style={{ animationDelay: '150ms' }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8B5CF6]" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

function RouteEditor({ routes, onChange }: { routes: MockRoute[]; onChange: (routes: MockRoute[]) => void }) {
  const update = (id: string, patch: Partial<MockRoute> & Record<string, unknown>) => onChange(routes.map((r) => (r.id === id ? { ...r, ...patch } as MockRoute : r)));
  const add = () => onChange([...routes, newRoute()]);
  const remove = (id: string) => onChange(routes.filter((r) => r.id !== id));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[#7A7F93]" style={{ letterSpacing: '0.06em' }}>
          <Layers size={12} /> Routes — one <code className="bg-[#070709] px-1 py-0.5 font-mono text-[#8B5CF6]" style={{ border: '1px solid #232329' }}>* .mock.yaml</code> per route, YAML-native
        </p>
        <Button size="sm" variant="secondary" onClick={add} className="hover:-translate-y-[1px] hover:border-[#2E2E36] active:translate-y-0">
          <Plus size={12} /> Add Route
        </Button>
      </div>
      {routes.length === 0 && (
        <div className="bg-[#070709] px-4 py-6 text-center text-xs text-[#7A7F93]" style={{ border: '1px dashed #232329' }}>
          No routes. Add manually or generate from OpenAPI in the Spec tab.
        </div>
      )}
      {routes.map((r, idx) => (
        <div
          key={r.id}
          className="space-y-2.5 bg-[#070709] p-3 transition-all hover:border-[#2E2E36] animate-fadeUp"
          style={{ border: '1px solid #232329', animationDelay: `${idx * 18}ms` }}
        >
          <div className="grid grid-cols-[110px_1fr_80px_1fr_70px_auto] items-center gap-2">
            <select
              value={r.method}
              onChange={(e) => update(r.id, { method: e.target.value as MockRoute['method'] })}
              className="bg-[#121215] px-2 py-2 font-mono text-xs font-semibold text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.12)]"
              style={{ border: '1px solid #232329', height: '34px' }}
            >
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <Input value={r.path} onChange={(e) => update(r.id, { path: e.target.value })} placeholder="/users/{id}" className="font-mono text-xs" />
            <Input type="number" value={r.status} onChange={(e) => update(r.id, { status: parseInt(e.target.value, 10) || 200 })} className="font-mono text-xs tabular-nums" />
            <Input value={r.body} onChange={(e) => update(r.id, { body: e.target.value })} placeholder='{"id":"123"}' className="font-mono text-xs" />
            <Input type="number" value={r.delay} onChange={(e) => update(r.id, { delay: parseInt(e.target.value, 10) || 0 })} title="Delay ms" className="font-mono text-xs tabular-nums" />
            <Button size="sm" variant="ghost" onClick={() => remove(r.id)} className="hover:text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)] active:scale-[0.96]">
              <Trash2 size={12} />
            </Button>
          </div>
          <div className="grid gap-2.5 bg-[#0E0E10] p-3" style={{ border: '1px solid #232329' }}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#F59E0B]" style={{ letterSpacing: '0.06em' }}>
              <Zap size={12} /> Chaos — latency / error injection (local)
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[#9FA3B5]">
                Latency jitter {(r as unknown as {chaosLatency?:number}).chaosLatency ?? 0}ms
                <input type="range" min={0} max={5000} step={100} value={(r as unknown as {chaosLatency?:number}).chaosLatency ?? 0} onChange={e=>update(r.id, { chaosLatency: parseInt(e.target.value,10) } as unknown as Partial<MockRoute>)} className="accent-[#8B5CF6] h-1" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[#9FA3B5]">
                Error rate {(r as unknown as {chaosErrorRate?:number}).chaosErrorRate ?? 0}%
                <input type="range" min={0} max={50} step={5} value={(r as unknown as {chaosErrorRate?:number}).chaosErrorRate ?? 0} onChange={e=>update(r.id, { chaosErrorRate: parseInt(e.target.value,10) } as unknown as Partial<MockRoute>)} className="accent-[#EF4444] h-1" />
              </label>
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-[#7A7F93]">Applies on top of fixed <code className="bg-[#121215] px-1 py-0.5" style={{ border: '1px solid #232329' }}>delay</code>. Rust mock handler sleeps <code className="bg-[#121215] px-1 py-0.5" style={{ border: '1px solid #232329' }}>delay + random(0..jitter)</code> and returns 5xx on <code className="bg-[#121215] px-1 py-0.5" style={{ border: '1px solid #232329' }}>errorRate%</code> (Phase4 F).</p>
          </div>
          <details className="bg-[#0E0E10] px-3 py-2" style={{ border: '1px solid #232329' }}>
            <summary className="cursor-pointer text-xs font-medium text-[#9FA3B5] hover:text-[#E6E8F0] transition-colors">Advanced — headers · variants · state</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-[#9FA3B5]">Headers (JSON)
                <textarea value={JSON.stringify(r.headers ?? {}, null, 2)} onChange={(e) => { try { update(r.id, { headers: JSON.parse(e.target.value) }); } catch {} }} rows={3} className="mt-1.5 w-full bg-[#070709] p-2 font-mono text-xs leading-relaxed text-[#E6E8F0] outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.12)]" style={{ border: '1px solid #232329' }} placeholder='{"Content-Type":"application/json"}' />
              </label>
              <label className="text-xs font-medium text-[#9FA3B5]">State (scope/operation/keyFrom)
                <textarea value={JSON.stringify(r.state ?? {}, null, 2)} onChange={(e) => { try { const v = JSON.parse(e.target.value); update(r.id, { state: v }); } catch {} }} rows={3} className="mt-1.5 w-full bg-[#070709] p-2 font-mono text-xs leading-relaxed text-[#E6E8F0] outline-none focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.12)]" style={{ border: '1px solid #232329' }} placeholder='{"scope":"users","operation":"create","keyFrom":"auto"}' />
              </label>
            </div>
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-[#9FA3B5]"><span>Variants (select via header/query)</span><Button size="sm" variant="ghost" onClick={() => update(r.id, { variants: [...(r.variants ?? []), { name: 'new-variant', status: 400, body: '{"error":"variant"}', headers: {}, trigger: 'header:x-mock-variant=new-variant' }] })} className="hover:border-[#2E2E36]"><Plus size={10} /> Add variant</Button></div>
              {(r.variants ?? []).length === 0 ? <p className="bg-[#070709] px-2 py-2 text-xs text-[#7A7F93]" style={{ border: '1px dashed #232329' }}>No variants. Variants let you return different bodies via <code className="bg-[#121215] px-1 py-0.5" style={{ border: '1px solid #232329' }}>x-mock-variant</code> header.</p> : (
                <div className="space-y-1.5">
                  {(r.variants ?? []).map((v, idx2) => (
                    <div key={idx2} className="flex gap-1.5">
                      <Input value={v.name} onChange={(e) => { const vs=[...(r.variants??[])]; vs[idx2]={...vs[idx2], name:e.target.value}; update(r.id,{variants:vs}); }} placeholder="name" className="w-28 text-xs" />
                      <Input value={v.status} onChange={(e) => { const vs=[...(r.variants??[])]; vs[idx2]={...vs[idx2], status: parseInt(e.target.value,10)||200}; update(r.id,{variants:vs}); }} className="w-16 text-xs tabular-nums" />
                      <Input value={v.trigger ?? ''} onChange={(e) => { const vs=[...(r.variants??[])]; vs[idx2]={...vs[idx2], trigger:e.target.value}; update(r.id,{variants:vs}); }} placeholder="header:x-mock-variant=..." className="flex-1 text-xs font-mono" />
                      <Button size="sm" variant="ghost" onClick={() => { const vs=[...(r.variants??[])]; vs.splice(idx2,1); update(r.id,{variants:vs}); }} className="hover:text-[#EF4444]"><Trash2 size={10} /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}

function HitLogPanel({ serverId }: { serverId: string }) {
  const [hits, setHits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      let data: any = null;
      try { data = await (api.mockServer as any).exportHits?.(serverId); if (typeof data === 'string') data = JSON.parse(data); } catch {}
      if (!Array.isArray(data)) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          data = await invoke('mock_hits', { id: serverId });
        } catch { data = []; }
      }
      setHits(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [serverId]);
  const clear = async () => {
    try { await (api.mockServer as any).clearHits?.(serverId); } catch {}
    setHits([]);
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(hits, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `mock-hits-${serverId}.json`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3 animate-fadeUp">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => void load()} className="hover:-translate-y-[1px] hover:border-[#2E2E36] active:translate-y-0"><History size={12} /> Refresh</Button>
        <Button size="sm" variant="ghost" onClick={clear} className="hover:text-[#EF4444] hover:bg-[rgba(239,68,68,0.08)]"><Trash2 size={12} /> Clear</Button>
        <Button size="sm" variant="ghost" onClick={exportJson} className="hover:border-[#2E2E36]"><Download size={12} /> Export JSON</Button>
      </div>
      {loading ? <p className="flex items-center gap-2 text-xs text-[#7A7F93]"><LoaderDots /> Loading…</p> : hits.length===0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center" style={{ border: '1px dashed #232329', background: '#070709' }}>
          <div className="flex h-9 w-9 items-center justify-center bg-[#121215] text-[#7A7F93]" style={{ border: '1px solid #232329' }}><History size={16} /></div>
          <p className="text-xs font-medium text-[#E6E8F0]">No hits yet</p>
          <p className="text-xs text-[#7A7F93]">Start the server and curl it — hits appear here with latency & matched route.</p>
        </div>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-auto pr-1">
          {hits.map((h: any, idx: number) => (
            <li key={h.id} className="flex items-center gap-2 bg-[#070709] px-2.5 py-2 text-xs transition-colors hover:bg-[#0E0E10] hover:border-[#2E2E36] animate-fadeUp" style={{ border: '1px solid #232329', borderLeft: `2px solid ${h.status>=400?'#EF4444':h.status>=300?'#F59E0B':'#10B981'}`, animationDelay: `${idx*10}ms` }}>
              <span className="font-mono text-xs font-bold tabular-nums" style={{ color: h.status>=400?'#EF4444':h.status>=300?'#F59E0B':'#10B981' }}>{h.method}</span>
              <span className="flex-1 truncate font-mono text-[#E6E8F0]">{h.path}</span>
              <span className="bg-[#121215] px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-[#E6E8F0]" style={{ border: '1px solid #232329' }}>{h.status}</span>
              {h.latencyMs != null && <span className="font-mono text-xs tabular-nums text-[#7A7F93]">{h.latencyMs}ms</span>}
              <span className="font-mono text-xs tabular-nums text-[#7A7F93]">{new Date(h.timestamp).toLocaleTimeString()}</span>
              {h.matchedRoute && <span className="hidden font-mono text-xs text-[#7A7F93] sm:inline">→ {h.matchedRoute.slice(0,6)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-1.5 text-xs leading-relaxed text-[#7A7F93]"><History size={11}/> Hit log stored locally (500 max), exportable. Shows latency, matched route, mode.</p>
    </div>
  );
}

function StatePanel({ serverId }: { serverId: string }) {
  const [snapshot, setSnapshot] = useState<Record<string, any>>({});
  const [key, setKey] = useState('');
  const [value, setValue] = useState('{"id":"1","name":"Ada"}');
  const load = async () => {
    try {
      const snap = await (api.mockServer as any).stateSnapshot?.(serverId);
      setSnapshot(snap ?? {});
    } catch { setSnapshot({}); }
  };
  useEffect(() => { void load(); }, [serverId]);
  const set = async () => {
    if (!key.trim()) return;
    try {
      const v = value.trim() ? JSON.parse(value) : null;
      await (api.mockServer as any).stateSet?.(serverId, key.trim(), v);
      setKey(''); setValue('{}');
      void load();
    } catch (e) { alert(String(e)); }
  };
  const clear = async () => {
    try { await (api.mockServer as any).stateClear?.(serverId); setSnapshot({}); } catch {}
  };
  return (
    <div className="space-y-3 animate-fadeUp">
      <div className="flex flex-wrap gap-2">
        <Input value={key} onChange={(e)=>setKey(e.target.value)} placeholder="users:123" className="min-w-[140px] flex-1 font-mono text-xs" />
        <Input value={value} onChange={(e)=>setValue(e.target.value)} placeholder='{"name":"Ada"}' className="min-w-[180px] flex-[2] font-mono text-xs" />
        <Button size="sm" variant="primary" onClick={set} className="hover:-translate-y-[1px] active:translate-y-0"><Database size={12} /> Set</Button>
        <Button size="sm" variant="ghost" onClick={clear} className="hover:text-[#EF4444]"><Trash2 size={12} /> Clear all</Button>
        <Button size="sm" variant="ghost" onClick={load} className="hover:border-[#2E2E36]"><RefreshCw size={12} /></Button>
      </div>
      <div className="bg-[#070709] p-3" style={{ border: '1px solid #232329' }}>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#7A7F93]" style={{ letterSpacing: '0.06em' }}><Database size={12} className="text-[#8B5CF6]" /> State store (scoped to server session, SQLite-backed) <span className="ml-auto bg-[#121215] px-1.5 py-0.5 font-mono text-xs tabular-nums text-[#E6E8F0]" style={{ border: '1px solid #232329' }}>{Object.keys(snapshot).length} keys</span></div>
        {Object.keys(snapshot).length===0 ? <p className="bg-[#121215] px-3 py-4 text-center text-xs text-[#7A7F93]" style={{ border: '1px dashed #232329' }}>Empty. POST /users creates <code className="bg-[#070709] px-1 py-0.5" style={{ border: '1px solid #232329' }}>users:{`{id}`}</code>, GET /users/{`{id}`} reads it.</p> : (
          <ul className="max-h-48 space-y-1 overflow-auto pr-1">
            {Object.entries(snapshot).map(([k,v], idx)=>(
              <li key={k} className="flex items-center gap-2 bg-[#121215] px-2.5 py-2 text-xs transition-colors hover:bg-[#16161A] hover:border-[#2E2E36] animate-fadeUp" style={{ border: '1px solid #232329', animationDelay: `${idx*12}ms` }}>
                <span className="font-mono text-xs font-semibold text-[#8B5CF6]">{k}</span>
                <span className="flex-1 truncate font-mono text-xs text-[#9FA3B5]">{JSON.stringify(v).slice(0,120)}</span>
                <button onClick={async()=>{ try{await (api.mockServer as any).stateSet?.(serverId,k,null); void load(); }catch{}}} className="flex h-6 w-6 items-center justify-center bg-[#070709] text-[#7A7F93] hover:bg-[rgba(239,68,68,0.10)] hover:text-[#EF4444] active:scale-95 transition-all" style={{ border: '1px solid #232329' }} aria-label="Delete key">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs leading-relaxed text-[#7A7F93]">Stateful mocks: POST creates, GET reads, DELETE removes. Config per route via <code className="bg-[#121215] px-1 py-0.5 font-mono" style={{ border: '1px solid #232329' }}>state.scope/operation/keyFrom</code> in <code className="bg-[#121215] px-1 py-0.5 font-mono" style={{ border: '1px solid #232329' }}>* .mock.yaml</code>.</p>
    </div>
  );
}

function McpPanel({ serverId }: { serverId: string }) {
  const [tools, setTools] = useState<any[]>([]);
  const [result, setResult] = useState<string>('');
  useEffect(() => { (async()=>{ try{ const t = await (api.mockServer as any).mcpListTools?.(); setTools(t??[]);}catch{}})(); }, []);
  const call = async (name: string) => {
    const args: any = {};
    if (name==='mock_list_routes' || name==='mock_hit_log' || name==='mock_set_state') args.serverId = serverId;
    if (name==='mock_set_state') { args.key = 'users:demo'; args.value = { id:'demo', name:'MCP' }; }
    try {
      const res = await (api.mockServer as any).mcpCall?.(name, args);
      setResult(JSON.stringify(res, null, 2));
    } catch (e) { setResult(String(e)); }
  };
  return (
    <div className="space-y-3 animate-fadeUp">
      <p className="text-xs leading-relaxed text-[#7A7F93]">Agent-native: local MCP tools <code className="bg-[#070709] px-1 py-0.5 font-mono text-[#E6E8F0]" style={{ border: '1px solid #232329' }}>mock_list_routes</code>, <code className="bg-[#070709] px-1 py-0.5 font-mono text-[#E6E8F0]" style={{ border: '1px solid #232329' }}>mock_create_route</code>, <code className="bg-[#070709] px-1 py-0.5 font-mono text-[#E6E8F0]" style={{ border: '1px solid #232329' }}>mock_set_state</code>, <code className="bg-[#070709] px-1 py-0.5 font-mono text-[#E6E8F0]" style={{ border: '1px solid #232329' }}>mock_hit_log</code>. Call from Claude/Cursor without leaving editor.</p>
      <div className="flex flex-wrap gap-1.5">
        {(tools.length?tools:[{name:'mock_list_routes'},{name:'mock_create_route'},{name:'mock_set_state'},{name:'mock_hit_log'}]).map((t:any)=>(
          <Button key={t.name} size="sm" variant="secondary" onClick={()=>call(t.name)} className="hover:-translate-y-[1px] hover:border-[#2E2E36] hover:text-[#8B5CF6] active:translate-y-0"><Bot size={12} /> {t.name}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={async()=>{ try{ await navigator.clipboard.writeText(JSON.stringify(tools,null,2)); }catch{}}} className="hover:border-[#2E2E36]"><Copy size={12} /> Copy tools JSON</Button>
      </div>
      {result && <pre className="max-h-48 overflow-auto bg-[#070709] p-3 font-mono text-xs leading-relaxed text-[#E6E8F0]" style={{ border: '1px solid #232329' }}>{result}</pre>}
      <p className="font-mono text-xs text-[#7A7F93]">MCP stdio transport: run <code className="bg-[#121215] px-1 py-0.5" style={{ border: '1px solid #232329' }}>apiforge mcp --port {`{serverId}`}</code> or call via Tauri <code className="bg-[#121215] px-1 py-0.5" style={{ border: '1px solid #232329' }}>mock_mcp_call</code>.</p>
    </div>
  );
}
