import { useState } from 'react';
import { ScanLine, ImportIcon, FolderSearch, Globe, AlertTriangle, CheckCircle2, Lock, FileCode, Cpu } from 'lucide-react';
import type { ScanResult, ScannedEndpoint } from '@shared/types/request';
import type { FrameworkDetection, SourceScanResult } from '@shared/types/scanner';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { METHOD_COLORS } from '@shared/constants/methods';
import { useCollectionStore } from '../../stores/collectionStore';
import { useUiStore } from '../../stores/uiStore';
import { isTauri } from '../../services/tauri';

function methodColor(m: string): string {
  return (METHOD_COLORS as Record<string,string>)[m as keyof typeof METHOD_COLORS] ?? 'var(--text-secondary)';
}

export function ScannerPanel() {
  const [tab, setTab] = useState<'openapi'|'source'>('openapi');

  // OpenAPI state
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Source state
  const [projectPath, setProjectPath] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:3000');
  const [apiVersion, setApiVersion] = useState('');
  const [detection, setDetection] = useState<FrameworkDetection | null>(null);
  const [sourceResult, setSourceResult] = useState<SourceScanResult | null>(null);
  const [sourceScanning, setSourceScanning] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceImporting, setSourceImporting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const scan = async () => {
    if (!url) return;
    setScanning(true);
    setError(null);
    try {
      const res = await api.scanner.scan(url);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const importEndpoints = async () => {
    if (!result) return;
    setImporting(true);
    try {
      await api.scanner.generate(result);
      await useCollectionStore.getState().load();
    } finally {
      setImporting(false);
    }
  };

  const browseFolder = async () => {
    if (!isTauri()) {
      setSourceError('Folder picker requires the desktop app (Tauri). Run `npm run dev` with Tauri.');
      return;
    }
    try {
      // @ts-ignore — optional dep, installed via cargo + npm
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Select backend project folder' });
      if (typeof selected === 'string' && selected) {
        setProjectPath(selected);
        void detectFramework(selected);
      }
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    }
  };

  const detectFramework = async (path?: string) => {
    const p = path ?? projectPath;
    if (!p) return;
    setDetecting(true);
    setSourceError(null);
    try {
      const det = await api.scanner.detectFramework(p);
      setDetection(det);
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  };

  const scanSource = async () => {
    if (!projectPath) return;
    setSourceScanning(true);
    setSourceError(null);
    setSourceResult(null);
    setImportSuccess(null);
    try {
      const res = await api.scanner.scanSource(projectPath, { includeComments: true, includeTests: false, maxFiles: 2000 });
      setSourceResult(res);
      setDetection({ framework: res.framework, language: res.language, confidence: res.confidence, rootFiles: [], routeFiles: [] });
      // Suggest a collection name based on framework, but keep user edit if already typed
      if (!collectionName) setCollectionName(`${res.framework} API`);
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    } finally {
      setSourceScanning(false);
    }
  };

  const importSource = async () => {
    if (!sourceResult) return;
    setSourceImporting(true);
    setImportSuccess(null);
    try {
      const nameToUse = collectionName.trim() || `${sourceResult.framework} API`;
      const out = await api.scanner.generateFromSource(sourceResult, baseUrl, apiVersion || undefined, undefined, nameToUse);
      await useCollectionStore.getState().load();
      setImportSuccess(`Imported “${nameToUse}” — ${sourceResult.totalRoutes} routes → ${out}`);
      console.log('Collection generated at', out);
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    } finally {
      setSourceImporting(false);
    }
  };

  const quickScan = async () => {
    if (!projectPath) return;
    setSourceScanning(true);
    setSourceError(null);
    setImportSuccess(null);
    try {
      const nameToUse = collectionName.trim() || undefined;
      const out = await api.scanner.quickScan(projectPath, baseUrl, nameToUse);
      await useCollectionStore.getState().load();
      setImportSuccess(`Quick imported → ${out}`);
      console.log('Quick scan collection at', out);
      await scanSource();
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    } finally {
      setSourceScanning(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <ScanLine size={18} className="text-[var(--accent)]" /> Route Scanner
      </h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Discover endpoints from a live OpenAPI spec or by scanning your backend source code.
      </p>

      <Tabs value={tab} onValueChange={(v)=>setTab(v as 'openapi'|'source')}>
        <TabsList className="mb-4">
          <TabsTrigger value="openapi"><Globe size={12} className="mr-1.5 inline" />OpenAPI / Live URL</TabsTrigger>
          <TabsTrigger value="source"><FileCode size={12} className="mr-1.5 inline" />Source Code (multi-language)</TabsTrigger>
        </TabsList>

        <TabsContent value="openapi">
          <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com  or  http://localhost:3000"
                onKeyDown={(e) => e.key === 'Enter' && scan()}
              />
              <Button variant="primary" onClick={scan} disabled={scanning || !url}>
                {scanning ? 'Scanning…' : 'Scan'}
              </Button>
            </div>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            {result && (
              <div className="mt-4 rounded border border-[var(--border)] bg-[var(--bg-primary)]">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 text-sm">
                  <span>
                    Detected: <span className="font-mono text-[var(--accent)]">{result.detectedSpec}</span> · {result.endpoints.length} endpoints
                    {result.raw ? <span className="ml-2 text-xs text-[var(--text-secondary)]">from {String((result.raw as any)?.info?.title ?? 'spec')}</span> : null}
                  </span>
                  <Button variant="primary" onClick={importEndpoints} disabled={importing}>
                    <ImportIcon size={14} /> {importing ? 'Importing…' : 'Import as Collection'}
                  </Button>
                </div>
                {result.endpoints.length === 0 ? (
                  <div className="p-6 text-center text-sm text-[var(--text-secondary)]">
                    <AlertTriangle size={18} className="mx-auto mb-2 text-[var(--warning)]" />
                    No endpoints found. Try <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5">/swagger.json</code> or check CORS (use Tauri).
                  </div>
                ) : (
                  <ul className="max-h-96 overflow-auto p-2">
                    {result.endpoints.map((ep: ScannedEndpoint, i) => (
                      <li key={i} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--bg-tertiary)]">
                        <span className="w-16 font-mono text-xs font-semibold" style={{ color: methodColor(ep.method) }}>{ep.method}</span>
                        <span className="font-mono text-[var(--text-primary)]">{ep.path}</span>
                        {ep.summary && <span className="truncate text-xs text-[var(--text-secondary)]">{ep.summary}</span>}
                        {ep.tags?.[0] && <span className="ml-auto rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{ep.tags[0]}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-3 flex items-start gap-2 rounded border border-dashed border-[var(--border)] bg-[var(--bg-primary)] p-3 text-xs text-[var(--text-secondary)]">
              <Cpu size={14} className="mt-0.5 shrink-0" />
              <span>
                Tip: For <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5">graphql</code> the scanner also tries <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5">POST /graphql</code> introspection. Use the Source tab for offline code scanning without running the server.
              </span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="source">
          <div className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            {/* Project path */}
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Project folder</label>
              <div className="flex gap-2">
                <Input value={projectPath} onChange={(e)=>setProjectPath(e.target.value)} placeholder={isTauri() ? "/home/user/my-express-api" : "Requires Tauri desktop — Pick not available in browser"} className="flex-1" />
                <Button variant="secondary" onClick={browseFolder}><FolderSearch size={14} /> Browse</Button>
                <Button variant="ghost" onClick={()=>detectFramework()} disabled={!projectPath || detecting}>{detecting ? 'Detecting…' : 'Detect'}</Button>
              </div>
              {!isTauri() && <p className="mt-1.5 text-xs text-[var(--warning)]">Browser preview cannot access filesystem — use <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5">tauri dev</code> for source scanning.</p>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Base URL (for generated collection)</label>
                <Input value={baseUrl} onChange={(e)=>setBaseUrl(e.target.value)} placeholder="http://localhost:3000" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">API version prefix (optional)</label>
                <Input value={apiVersion} onChange={(e)=>setApiVersion(e.target.value)} placeholder="v1  or  api/v1" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Collection name</label>
                <Input value={collectionName} onChange={(e)=>setCollectionName(e.target.value)} placeholder={sourceResult ? `${sourceResult.framework} API` : "My API"} />
              </div>
            </div>

            {/* Detection card */}
            {(detection || sourceResult) && (
              <div className="mt-4 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[var(--accent-subtle)] px-2 py-1 text-xs font-semibold text-[var(--accent)]">{(detection ?? sourceResult)?.language ?? 'unknown'}</span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{(detection ?? sourceResult)?.framework ?? 'Unknown'}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{Math.round(((detection ?? sourceResult)?.confidence ?? 0)*100)}% confidence</span>
                  {sourceResult && <span className="ml-auto flex items-center gap-1 text-xs text-[var(--text-secondary)]"><CheckCircle2 size={12} className="text-[var(--success)]" /> {sourceResult.totalFiles} files · {sourceResult.totalRoutes} routes</span>}
                </div>
                {detection?.rootFiles?.length ? <div className="mt-2 text-xs text-[var(--text-secondary)]">Root: <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono text-[11px]">{detection.rootFiles.slice(0,2).join(', ')}</code></div> : null}
                {sourceResult?.warnings?.length ? <div className="mt-2 flex gap-1.5 rounded border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-2 py-1.5 text-xs text-[var(--warning)]"><AlertTriangle size={12} className="mt-0.5 shrink-0" /><span>{sourceResult.warnings.slice(0,2).join(' · ')}</span></div> : null}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={scanSource} disabled={sourceScanning || !projectPath}>{sourceScanning ? 'Scanning…' : 'Scan Routes'}</Button>
              <Button variant="secondary" onClick={quickScan} disabled={sourceScanning || !projectPath} title="Scan + generate collection in one shot">Quick Scan & Import</Button>
              {sourceResult && sourceResult.routes.length > 0 && (
                <Button variant="primary" onClick={importSource} disabled={sourceImporting} className="ml-auto">
                  <ImportIcon size={14} /> {sourceImporting ? 'Importing…' : `Import ${sourceResult.totalRoutes} routes`}
                </Button>
              )}
            </div>

            {sourceError && <div className="mt-3 rounded border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">{sourceError}</div>}
            {importSuccess && <div className="mt-3 flex items-center justify-between gap-2 rounded border border-[var(--success)]/40 bg-[var(--success)]/10 px-3 py-2 text-sm text-[var(--success)]"><span className="truncate">{importSuccess}</span><Button variant="ghost" size="sm" onClick={()=>{ void useCollectionStore.getState().load(); useUiStore.getState().setActivePage('collections'); }}>View in Collections</Button></div>}

            {/* Results */}
            {sourceResult && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Scanned routes ({sourceResult.totalRoutes})</h3>
                  <span className="text-xs text-[var(--text-secondary)]">{sourceResult.totalFiles} files</span>
                </div>
                {sourceResult.routes.length === 0 ? (
                  <div className="rounded border border-[var(--border)] bg-[var(--bg-primary)] p-6 text-center text-sm text-[var(--text-secondary)]">No routes detected. Check framework detection or include tests checkbox. Warnings: {sourceResult.warnings.join('; ') || 'none'}</div>
                ) : (
                  <div className="max-h-[480px] overflow-auto rounded border border-[var(--border)] bg-[var(--bg-primary)]">
                    {sourceResult.routes.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 border-b border-[var(--border)]/60 px-2.5 py-1.5 last:border-0 hover:bg-[var(--bg-tertiary)]">
                        <span className="w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-bold" style={{ background: 'var(--bg-tertiary)', color: methodColor(r.method) }}>{r.method}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-primary)]" title={r.path}>{r.path}</span>
                        <span className="hidden max-w-[160px] truncate text-xs text-[var(--text-secondary)] sm:block" title={r.handler}>{r.handler}</span>
                        <span className="hidden max-w-[180px] truncate text-[11px] text-[var(--text-muted)] sm:block" title={r.file}>{r.file.split(/[\\/]/).slice(-2).join('/')}:{r.line}</span>
                        {r.authRequired && <span className="rounded bg-[var(--warning)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--warning)]" title="Auth required"><Lock size={10} className="inline" /></span>}
                      </div>
                    ))}
                  </div>
                )}
                {/* Folder preview */}
                {sourceResult.routes.length > 0 && (
                  <div className="mt-3 rounded border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                    <div className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">Will generate folders:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[...new Set(sourceResult.routes.map(r => {
                        const segs = r.path.split('/').filter(s=>s && !s.startsWith('{') && !s.startsWith(':'));
                        const skip = segs.findIndex(s=> !s.startsWith('v') && isNaN(Number(s)) && s!=='api');
                        const name = segs[skip>=0?skip:0] ?? 'Root';
                        return name.charAt(0).toUpperCase()+name.slice(1);
                      }))].slice(0,12).map(f=> <span key={f} className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--text-secondary)]">{f}</span>)}
                    </div>
                    <div className="mt-2 text-xs text-[var(--text-muted)]">Base URL <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono">{baseUrl}</code> {apiVersion ? <>with version <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono">{apiVersion}</code></> : ''} · files will be written as <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono">~/APIForge/&lt;Framework&gt;/</code> (Tauri workspace)</div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 rounded border border-dashed border-[var(--border)] bg-[var(--bg-primary)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Pipeline:</strong> Detect framework → pick parser (Express / FastAPI / Laravel / Spring / ASP.NET / Gin / Generic) → regex AST → dedupe → generate <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono">folders/*.request.yaml</code>. See <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono">src-tauri/src/scanner/</code> for 15+ frameworks table.
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
