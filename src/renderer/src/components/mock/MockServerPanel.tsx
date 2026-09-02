import { useEffect, useState } from 'react';
import { Plus, Play, Square, Trash2, History, Server, Route, Database, FileJson, Bot, Copy, Download, RefreshCw, Settings2 } from 'lucide-react';
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
      // Fallback to v2 list
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
      // Try v2 delete, fallback to local
      try { await (api.mockServer as any).delete?.(id); } catch {}
      setServers((prev) => prev.filter((s) => s.id !== id));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const updateRoutes = async (id: string, routes: MockRoute[]) => {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, routes } : s)));
    // Persist via v2 update if available
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
      // Try to read as file path first if it looks like a path, otherwise treat as raw spec
      let specContent = specInput.trim();
      // If it looks like a file path and we're in Tauri, try to read the file via FS
      if (isTauri() && (specContent.endsWith('.json') || specContent.endsWith('.yaml') || specContent.endsWith('.yml')) && !specContent.trimStart().startsWith('{')) {
        try {
          const { readTextFile } = await import('@tauri-apps/plugin-fs');
          specContent = await readTextFile(specContent);
        } catch {}
      }
      const res = await (api.mockServer as any).generateFromOpenapi?.(specContent, undefined, true, undefined);
      // res is GenerationResult with routes
      const routes: MockRoute[] = (res?.routes ?? res ?? []) as any;
      if (Array.isArray(routes) && routes.length > 0) {
        const srv = servers.find(s => s.id === serverId);
        const merged = [...(srv?.routes ?? []), ...routes];
        // Dedupe by method+path
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
    <div className="flex h-full flex-col bg-[var(--bg-primary)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <Server size={16} className="text-[var(--accent)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Mock Server v2</h2>
        <span className="ml-2 hidden rounded bg-[var(--accent-subtle)] px-1.5 py-0.5 text-xs text-[var(--accent)] sm:inline">spec-driven · stateful · proxy/record · MCP</span>
        <Button variant="ghost" size="sm" onClick={() => void load()} className="ml-auto"><RefreshCw size={12} /> Refresh</Button>
      </div>

      <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Local API mock" className="sm:col-span-2" />
          <Input label="Port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="3001" />
          <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs outline-none">
              <option value="mock">mock</option>
              <option value="proxy">proxy</option>
              <option value="record">record</option>
            </select>
          </label>
          <Input label="Target URL (proxy/record)" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="http://localhost:3000" className="sm:col-span-2" />
          <Input label="Mocks dir (optional)" value={mocksDir} onChange={(e) => setMocksDir(e.target.value)} placeholder="~/APIForge/mocks/my-mock" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-[var(--text-secondary)]"><input type="checkbox" checked={stateEnabled} onChange={(e) => setStateEnabled(e.target.checked)} /> Stateful (SQLite)</label>
          <label className="flex items-center gap-1.5 text-[var(--text-secondary)]"><input type="checkbox" checked={graphqlEnabled} onChange={(e) => setGraphqlEnabled(e.target.checked)} /> GraphQL (operation name)</label>
          <span className="ml-auto text-[var(--text-muted)]">YAML: one <code className="rounded bg-[var(--bg-tertiary)] px-1">*.mock.yaml</code> per route · <code>apiforge mock --file ./mocks --port 3001 --mode record</code></span>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={create}><Plus size={14} /> Create server</Button>
          {error && <span className="self-center text-xs text-[var(--danger)]">{error}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {loading ? <p className="text-sm text-[var(--text-secondary)]">Loading…</p> : servers.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-6 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">No mock servers yet</p>
            <p className="mx-auto mt-1 max-w-lg text-xs text-[var(--text-secondary)]">Create one above, or <span className="text-[var(--accent)]">Generate from OpenAPI</span> in a server's Spec tab. Each route is a <code>*.mock.yaml</code> — git-diffable, offline, no cloud.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((srv) => {
              const isExpanded = expanded === srv.id;
              const tab = activeTab[srv.id] ?? 'routes';
              return (
                <div key={srv.id} className="overflow-hidden rounded border border-[var(--border)] bg-[var(--bg-secondary)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setExpanded(isExpanded ? null : srv.id)} className="text-[var(--text-primary)]"><Route size={14} /></button>
                      <span className="font-medium text-[var(--text-primary)]">{srv.name}</span>
                      <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-secondary)]">:{srv.port}</span>
                      <span className={`rounded px-1.5 py-0.5 text-xs ${srv.running ? 'bg-[var(--success)]/20 text-[var(--success)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>{srv.running ? 'running' : 'stopped'}</span>
                      <span className="hidden rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)] sm:inline">{(srv as any).mode ?? 'mock'}</span>
                      {(srv as any).stateEnabled && <span className="hidden items-center gap-1 rounded bg-[var(--accent-subtle)] px-1.5 py-0.5 text-xs text-[var(--accent)] sm:inline-flex"><Database size={10} /> stateful</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {srv.running ? <Button size="sm" variant="danger" onClick={() => stop(srv.id)}><Square size={12} /> Stop</Button> : <Button size="sm" variant="primary" onClick={() => start(srv.id)}><Play size={12} /> Start</Button>}
                      <Button size="sm" variant="ghost" onClick={() => removeServer(srv.id)}><Trash2 size={12} /></Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <>
                      <div className="flex gap-1 border-y border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1">
                        {(['routes','hits','state','spec','mcp'] as ServerTab[]).map(t => (
                          <button key={t} onClick={() => setActiveTab(prev => ({ ...prev, [srv.id]: t }))} className={`rounded px-2 py-1 text-xs font-medium capitalize ${tab===t ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{t}</button>
                        ))}
                        <span className="ml-auto hidden items-center gap-1 text-xs text-[var(--text-muted)] sm:inline-flex"><Settings2 size={10} /> {srv.routes.length} routes</span>
                      </div>

                      <div className="p-3">
                        {tab === 'routes' && <RouteEditor routes={srv.routes} onChange={(routes) => updateRoutes(srv.id, routes)} />}
                        {tab === 'hits' && <HitLogPanel serverId={srv.id} />}
                        {tab === 'state' && <StatePanel serverId={srv.id} />}
                        {tab === 'spec' && (
                          <div className="space-y-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">OpenAPI spec (paste JSON/YAML or file path)</label>
                              <textarea value={specInput} onChange={(e) => setSpecInput(e.target.value)} placeholder={`{"openapi":"3.0.0","info":{"title":"My API"},"paths":{"/users":{"get":{"responses":{"200":{"description":"ok"}}}}}}`} rows={6} className="w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] p-2 font-mono text-xs outline-none focus:border-[var(--accent)]" />
                              <div className="mt-2 flex gap-2">
                                <Button size="sm" variant="primary" onClick={() => generateFromSpec(srv.id)} disabled={specGenerating===srv.id}><FileJson size={12} /> {specGenerating===srv.id?'Generating…':'Generate mocks from spec'}</Button>
                                <Button size="sm" variant="secondary" onClick={async () => {
                                  if (!isTauri()) { setError('File picker requires Tauri'); return; }
                                  const { open } = await import('@tauri-apps/plugin-dialog');
                                  const sel = await open({ filters: [{ name: 'OpenAPI', extensions: ['json','yaml','yml'] }] }) as string | null;
                                  if (sel) {
                                    try {
                                      const { readTextFile } = await import('@tauri-apps/plugin-fs');
                                      const txt = await readTextFile(sel);
                                      setSpecInput(txt);
                                    } catch (e) { setError(String(e)); }
                                  }
                                }}>Pick file…</Button>
                              </div>
                              <p className="mt-1 text-xs text-[var(--text-muted)]">Generates realistic bodies via Faker (email/uuid/date/price), variants (success/validation-error/server-error/empty-list), and stateful hints. Re-import shows diff (added/changed/removed) — never silent overwrite.</p>
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

function RouteEditor({ routes, onChange }: { routes: MockRoute[]; onChange: (routes: MockRoute[]) => void }) {
  const update = (id: string, patch: Partial<MockRoute>) => onChange(routes.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => onChange([...routes, newRoute()]);
  const remove = (id: string) => onChange(routes.filter((r) => r.id !== id));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-[var(--text-secondary)]">Routes — one <code>*.mock.yaml</code> per route, YAML-native</p>
        <Button size="sm" variant="secondary" onClick={add}><Plus size={12} /> Add Route</Button>
      </div>
      {routes.length === 0 && <p className="text-sm text-[var(--text-secondary)]">No routes. Add manually or generate from OpenAPI in the Spec tab.</p>}
      {routes.map((r) => (
        <div key={r.id} className="space-y-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-2">
          <div className="grid grid-cols-[110px_1fr_80px_1fr_70px_auto] items-center gap-2">
            <select value={r.method} onChange={(e) => update(r.id, { method: e.target.value as MockRoute['method'] })} className="rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs outline-none">
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <Input value={r.path} onChange={(e) => update(r.id, { path: e.target.value })} placeholder="/users/{id}" className="font-mono text-xs" />
            <Input type="number" value={r.status} onChange={(e) => update(r.id, { status: parseInt(e.target.value, 10) || 200 })} className="text-xs" />
            <Input value={r.body} onChange={(e) => update(r.id, { body: e.target.value })} placeholder='{"id":"123"}' className="font-mono text-xs" />
            <Input type="number" value={r.delay} onChange={(e) => update(r.id, { delay: parseInt(e.target.value, 10) || 0 })} title="Delay ms" className="text-xs" />
            <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 size={12} /></Button>
          </div>
          <details className="rounded bg-[var(--bg-tertiary)] px-2 py-1">
            <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">Advanced — headers · variants · state</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-[var(--text-secondary)]">Headers (JSON)
                <textarea value={JSON.stringify(r.headers ?? {}, null, 2)} onChange={(e) => { try { update(r.id, { headers: JSON.parse(e.target.value) }); } catch {} }} rows={3} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] p-1 font-mono text-xs" placeholder='{"Content-Type":"application/json"}' />
              </label>
              <label className="text-xs text-[var(--text-secondary)]">State (scope/operation/keyFrom)
                <textarea value={JSON.stringify(r.state ?? {}, null, 2)} onChange={(e) => { try { const v = JSON.parse(e.target.value); update(r.id, { state: v }); } catch {} }} rows={3} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] p-1 font-mono text-xs" placeholder='{"scope":"users","operation":"create","keyFrom":"auto"}' />
              </label>
            </div>
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-secondary)]"><span>Variants (select via header/query)</span><Button size="sm" variant="ghost" onClick={() => update(r.id, { variants: [...(r.variants ?? []), { name: 'new-variant', status: 400, body: '{"error":"variant"}', headers: {}, trigger: 'header:x-mock-variant=new-variant' }] })}><Plus size={10} /> Add variant</Button></div>
              {(r.variants ?? []).length === 0 ? <p className="text-xs text-[var(--text-muted)]">No variants. Variants let you return different bodies via <code>x-mock-variant</code> header.</p> : (
                <div className="space-y-1">
                  {(r.variants ?? []).map((v, idx) => (
                    <div key={idx} className="flex gap-1">
                      <Input value={v.name} onChange={(e) => { const vs=[...(r.variants??[])]; vs[idx]={...vs[idx], name:e.target.value}; update(r.id,{variants:vs}); }} placeholder="name" className="w-28 text-xs" />
                      <Input value={v.status} onChange={(e) => { const vs=[...(r.variants??[])]; vs[idx]={...vs[idx], status: parseInt(e.target.value,10)||200}; update(r.id,{variants:vs}); }} className="w-16 text-xs" />
                      <Input value={v.trigger ?? ''} onChange={(e) => { const vs=[...(r.variants??[])]; vs[idx]={...vs[idx], trigger:e.target.value}; update(r.id,{variants:vs}); }} placeholder="header:x-mock-variant=..." className="flex-1 text-xs" />
                      <Button size="sm" variant="ghost" onClick={() => { const vs=[...(r.variants??[])]; vs.splice(idx,1); update(r.id,{variants:vs}); }}><Trash2 size={10} /></Button>
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
      // Try v2 first, fallback to legacy
      let data: any = null;
      try { data = await (api.mockServer as any).exportHits?.(serverId); if (typeof data === 'string') data = JSON.parse(data); } catch {}
      if (!Array.isArray(data)) {
        // fallback: fetch via direct Tauri call
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
    <div className="space-y-2">
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" onClick={() => void load()}><History size={12} /> Refresh</Button>
        <Button size="sm" variant="ghost" onClick={clear}><Trash2 size={12} /> Clear</Button>
        <Button size="sm" variant="ghost" onClick={exportJson}><Download size={12} /> Export JSON</Button>
      </div>
      {loading ? <p className="text-xs text-[var(--text-secondary)]">Loading…</p> : hits.length===0 ? <p className="text-xs text-[var(--text-secondary)]">No hits yet. Start the server and curl it.</p> : (
        <ul className="max-h-64 space-y-1 overflow-auto">
          {hits.map((h: any) => (
            <li key={h.id} className="flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs">
              <span className="font-mono font-semibold" style={{ color: h.status>=400?'var(--danger)':h.status>=300?'var(--warning)':'var(--success)' }}>{h.method}</span>
              <span className="flex-1 truncate font-mono">{h.path}</span>
              <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5">{h.status}</span>
              {h.latencyMs != null && <span className="text-[var(--text-muted)]">{h.latencyMs}ms</span>}
              <span className="text-[var(--text-muted)]">{new Date(h.timestamp).toLocaleTimeString()}</span>
              {h.matchedRoute && <span className="hidden text-[var(--text-muted)] sm:inline">→ {h.matchedRoute.slice(0,6)}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-[var(--text-muted)]">Hit log stored locally (500 max), exportable. Shows latency, matched route, mode.</p>
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
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={key} onChange={(e)=>setKey(e.target.value)} placeholder="users:123" className="flex-1" />
        <Input value={value} onChange={(e)=>setValue(e.target.value)} placeholder='{"name":"Ada"}' className="flex-[2]" />
        <Button size="sm" variant="primary" onClick={set}><Database size={12} /> Set</Button>
        <Button size="sm" variant="ghost" onClick={clear}><Trash2 size={12} /> Clear all</Button>
        <Button size="sm" variant="ghost" onClick={load}><RefreshCw size={12} /></Button>
      </div>
      <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-2">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]"><Database size={12} /> State store (scoped to server session, SQLite-backed) <span className="ml-auto font-mono">{Object.keys(snapshot).length} keys</span></div>
        {Object.keys(snapshot).length===0 ? <p className="text-xs text-[var(--text-muted)]">Empty. POST /users creates <code>users:{"{id}"}</code>, GET /users/{"{id}"} reads it.</p> : (
          <ul className="max-h-48 space-y-1 overflow-auto">
            {Object.entries(snapshot).map(([k,v])=>(
              <li key={k} className="flex gap-2 rounded bg-[var(--bg-tertiary)] px-2 py-1 text-xs">
                <span className="font-mono font-semibold text-[var(--accent)]">{k}</span>
                <span className="flex-1 truncate font-mono text-[var(--text-secondary)]">{JSON.stringify(v).slice(0,120)}</span>
                <button onClick={async()=>{ try{await (api.mockServer as any).stateSet?.(serverId,k,null); void load(); }catch{}}} className="text-[var(--danger)]">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)]">Stateful mocks: POST creates, GET reads, DELETE removes. Config per route via <code>state.scope/operation/keyFrom</code> in <code>*.mock.yaml</code>.</p>
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
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-secondary)]">Agent-native: local MCP tools <code>mock_list_routes</code>, <code>mock_create_route</code>, <code>mock_set_state</code>, <code>mock_hit_log</code>. Call from Claude/Cursor without leaving editor.</p>
      <div className="flex flex-wrap gap-1">
        {(tools.length?tools:[{name:'mock_list_routes'},{name:'mock_create_route'},{name:'mock_set_state'},{name:'mock_hit_log'}]).map((t:any)=>(
          <Button key={t.name} size="sm" variant="secondary" onClick={()=>call(t.name)}><Bot size={12} /> {t.name}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={async()=>{ try{ await navigator.clipboard.writeText(JSON.stringify(tools,null,2)); }catch{}}}><Copy size={12} /> Copy tools JSON</Button>
      </div>
      {result && <pre className="max-h-48 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-primary)] p-2 font-mono text-xs">{result}</pre>}
      <p className="text-xs text-[var(--text-muted)]">MCP stdio transport: run <code>apiforge mcp --port {`{serverId}`}</code> or call via Tauri <code>mock_mcp_call</code>.</p>
    </div>
  );
}
