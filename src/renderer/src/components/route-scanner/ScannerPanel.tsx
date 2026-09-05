import { useState, useEffect } from 'react';
import { ScanLine, ImportIcon, FolderSearch, Globe, AlertTriangle, CheckCircle2, Lock, FileCode, Cpu, Sparkles, Search, Layers, Loader2, ArrowRight } from 'lucide-react';
import type { ScanResult, ScannedEndpoint } from '@shared/types/request';
import type { BackendFramework, FrameworkDetection, SourceScanResult } from '@shared/types/scanner';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { METHOD_COLORS } from '@shared/constants/methods';
import { useCollectionStore } from '../../stores/collectionStore';
import { useUiStore } from '../../stores/uiStore';
import { isTauri } from '../../services/tauri';
import { BolaCandidatesList } from './BolaCandidatesList';
import { CoveragePanel } from './CoveragePanel';
import { ScanDiffPanel } from './ScanDiffPanel';
import { diffScans } from '../../lib/scanner/scanDiff';
import type { ScanDiff } from '../../lib/scanner/scanDiff';

function methodColor(m: string): string {
  return (METHOD_COLORS as Record<string,string>)[m as keyof typeof METHOD_COLORS] ?? '#9FA3B5';
}

function warningMessage(w: string | { message: string }): string {
  return typeof w === 'string' ? w : ((w as any).message ?? String(w));
}

export function ScannerPanel() {
  const [tab, setTab] = useState<'openapi'|'source'>('openapi');

  const [url, setUrl] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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
  const [forcedFramework, setForcedFramework] = useState<BackendFramework | ''>('');
  const [scanDiff, setScanDiff] = useState<ScanDiff | null>(null);
  const [prevScanLabel, setPrevScanLabel] = useState<string | undefined>(undefined);
  const [exportingOpenApi, setExportingOpenApi] = useState(false);
  const [isWatching, setIsWatching] = useState(false);

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
    setScanDiff(null);
    let prev: SourceScanResult | null = null;
    try {
      prev = await api.scanner.getLastScan(projectPath);
    } catch {}
    try {
      const opts: Record<string, unknown> = { includeComments: true, includeTests: false, maxFiles: 2000 };
      if (forcedFramework) (opts as any).forcedFramework = forcedFramework;
      const res = await api.scanner.scanSource(projectPath, opts as any);
      // Compute diff vs previous
      if (prev && prev.routes.length > 0) {
        try {
          const d = diffScans(prev, res);
          if (d.added.length > 0 || d.removed.length > 0 || d.modified.length > 0) {
            setScanDiff(d);
            setPrevScanLabel('previous');
          } else {
            setScanDiff(null);
          }
        } catch {}
      }
      setSourceResult(res);
      try { localStorage.setItem('apiforge-last-scan', JSON.stringify(res)); } catch {}
      setDetection({ framework: res.framework, language: res.language, confidence: res.confidence, rootFiles: [], routeFiles: [] });
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

  const exportOpenApi = async () => {
    if (!sourceResult) return;
    setExportingOpenApi(true);
    try {
      const out = await api.scanner.exportOpenApi(sourceResult);
      setImportSuccess(`OpenAPI exported → ${out}`);
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportingOpenApi(false);
    }
  };

  const toggleWatch = async () => {
    if (!projectPath) {
      setSourceError('Set a project folder first');
      return;
    }
    try {
      if (isWatching) {
        await api.scanner.watchStop(projectPath);
        setIsWatching(false);
      } else {
        await api.scanner.watchStart(projectPath);
        setIsWatching(true);
      }
    } catch (e) {
      setSourceError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!isWatching) return;
    let unlisten: (() => void) | null = null;
    let unlistenErr: (() => void) | null = null;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<SourceScanResult>('scanner:watch-update', (event) => {
          const result = event.payload as unknown as SourceScanResult;
          if (sourceResult) {
            try {
              const d = diffScans(sourceResult, result);
              if (d.added.length || d.removed.length || d.modified.length) {
                setScanDiff(d);
                setPrevScanLabel('watch');
              }
            } catch {}
          }
          setSourceResult(result);
          setDetection({ framework: result.framework, language: result.language, confidence: result.confidence, rootFiles: [], routeFiles: [] });
          if (!collectionName) setCollectionName(`${result.framework} API`);
        });
        unlistenErr = await listen<string>('scanner:watch-error', (event) => {
          setSourceError(event.payload as string);
        });
      } catch {}
    })();
    return () => {
      if (unlisten) unlisten();
      if (unlistenErr) unlistenErr();
    };
  }, [isWatching, sourceResult, collectionName]);

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#070709] overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
        {/* Header — full width, sticky */}
        <div className="sticky top-0 z-10 border-b px-6 py-4" style={{ background: '#0E0E10', borderColor: '#232329' }}>
          <h2 className="flex items-center gap-3 text-[16px] font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.02em' }}>
            <span className="flex h-8 w-8 items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>
              <ScanLine size={16} strokeWidth={1.9} />
            </span>
            Route Scanner
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium" style={{ background: '#121215', border: '1px solid #232329', color: '#7A7F93' }}>
              <Sparkles size={10} /> OpenAPI + Source
            </span>
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: '#9FA3B5' }}>
            Discover endpoints from a live OpenAPI spec or by scanning your backend source code. Imports become file-backed collections.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v)=>setTab(v as 'openapi'|'source')}>
          <TabsList className="mb-4">
            <TabsTrigger value="openapi"><Globe size={12} className="mr-1.5 inline" />OpenAPI / Live URL</TabsTrigger>
            <TabsTrigger value="source"><FileCode size={12} className="mr-1.5 inline" />Source Code (multi-language)</TabsTrigger>
          </TabsList>

          <TabsContent value="openapi">
            <div className="overflow-hidden" style={{ background: '#0E0E10', border: '1px solid #232329', boxShadow: '0 4px 20px rgba(0,0,0,0.22)' }}>
              {/* Section header — sticky */}
              <div className="sticky top-0 z-[1] flex items-center gap-2 border-b px-4 py-3" style={{ background: '#0E0E10', borderColor: '#232329' }}>
                <span className="flex h-6 w-6 items-center justify-center" style={{ background: '#121215', border: '1px solid #232329', color: '#8B5CF6' }}>
                  <Globe size={12} />
                </span>
                <span className="text-xs font-semibold tracking-wide" style={{ color: '#E6E8F0', letterSpacing: '0.04em' }}>LIVE SPEC</span>
                <span className="text-xs" style={{ color: '#5A5E6E' }}>Fetch & parse OpenAPI / Swagger</span>
              </div>

              <div className="p-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-[12px]" style={{ color: '#5A5E6E' }} />
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://api.example.com  or  http://localhost:3000/swagger.json"
                      onKeyDown={(e) => e.key === 'Enter' && scan()}
                      className="pl-8"
                    />
                  </div>
                  <Button variant="primary" onClick={scan} disabled={scanning || !url} className="active:scale-[0.97] min-w-[92px]">
                    {scanning ? <><Loader2 size={13} className="animate-spin" /> Scanning…</> : <><ScanLine size={13} /> Scan</>}
                  </Button>
                </div>

                {scanning && (
                  <div className="mt-3">
                    <div className="h-1 w-full overflow-hidden" style={{ background: '#121215', border: '1px solid #232329' }}>
                      <div className="h-full w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite]" style={{ background: '#8B5CF6', boxShadow: '0 0 8px rgba(139,92,246,0.5)' }} />
                    </div>
                    <div className="mt-3 grid gap-2">
                      <div className="h-10 skeleton" /><div className="h-10 skeleton" /><div className="h-10 skeleton" />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-3 flex items-start gap-2.5 px-3 py-2.5 text-sm animate-fadeUp" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#EF4444' }}>
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span className="break-words">{error}</span>
                  </div>
                )}

                {result && (
                  <div className="mt-4 overflow-hidden animate-fadeUp" style={{ background: '#070709', border: '1px solid #232329' }}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5" style={{ background: '#121215', borderColor: '#232329' }}>
                      <span className="flex flex-wrap items-center gap-2 text-sm" style={{ color: '#E6E8F0' }}>
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>
                          <Layers size={11} /> {result.detectedSpec}
                        </span>
                        <span className="text-xs font-mono tabular-nums" style={{ color: '#9FA3B5' }}>{result.endpoints.length} endpoints</span>
                        {result.raw ? <span className="hidden sm:inline text-xs" style={{ color: '#5A5E6E' }}>from {String((result.raw as any)?.info?.title ?? 'spec')}</span> : null}
                      </span>
                      <Button variant="primary" onClick={importEndpoints} disabled={importing} className="active:scale-[0.97]">
                        <ImportIcon size={13} /> {importing ? 'Importing…' : 'Import as Collection'} <ArrowRight size={13} className="opacity-60" />
                      </Button>
                    </div>

                    {result.endpoints.length === 0 ? (
                      <div className="p-8 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center" style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.22)', color: '#FBBF24' }}>
                          <AlertTriangle size={16} />
                        </div>
                        <p className="mt-3 text-sm font-medium" style={{ color: '#E6E8F0' }}>No endpoints found</p>
                        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed" style={{ color: '#7A7F93' }}>
                          Try <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>/swagger.json</code> or <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>/openapi.json</code> · check CORS (use Tauri desktop) or verify spec is reachable.
                        </p>
                      </div>
                    ) : (
                      <ul className="max-h-[380px] overflow-auto p-2 space-y-1">
                        {result.endpoints.map((ep: ScannedEndpoint, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm transition-all duration-200 hover:translate-y-[-1px] hover:shadow-[0_4px_12px_rgba(0,0,0,0.18)]"
                            style={{ background: '#0E0E10', border: '1px solid #232329' }}
                          >
                            <span className="w-[64px] shrink-0 text-center font-mono text-[11px] font-bold tracking-wide px-1.5 py-1" style={{ background: '#121215', border: '1px solid #232329', color: methodColor(ep.method) }}>{ep.method}</span>
                            <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium" style={{ color: '#E6E8F0' }}>{ep.path}</span>
                            {ep.summary && <span className="hidden lg:block max-w-[220px] truncate text-xs" style={{ color: '#7A7F93' }}>{ep.summary}</span>}
                            {ep.tags?.[0] && <span className="ml-auto hidden sm:inline-flex px-2 py-0.5 text-[11px] font-medium" style={{ background: '#121215', border: '1px solid #232329', color: '#9FA3B5' }}>{ep.tags[0]}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="mt-3 flex items-start gap-2.5 p-3 text-xs leading-relaxed" style={{ background: '#070709', border: '1px dashed #232329', color: '#9FA3B5' }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ background: '#121215', border: '1px solid #232329', color: '#7A7F93' }}>
                    <Cpu size={12} />
                  </span>
                  <span>
                    Tip: For <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>graphql</code> the scanner also tries <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>POST /graphql</code> introspection. Use the Source tab for offline code scanning without running the server.
                  </span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="source">
            <div className="overflow-hidden" style={{ background: '#0E0E10', border: '1px solid #232329', boxShadow: '0 4px 20px rgba(0,0,0,0.22)' }}>
              <div className="sticky top-0 z-[1] flex items-center gap-2 border-b px-4 py-3" style={{ background: '#0E0E10', borderColor: '#232329' }}>
                <span className="flex h-6 w-6 items-center justify-center" style={{ background: '#121215', border: '1px solid #232329', color: '#8B5CF6' }}>
                  <FileCode size={12} />
                </span>
                <span className="text-xs font-semibold tracking-wide" style={{ color: '#E6E8F0', letterSpacing: '0.04em' }}>SOURCE SCAN</span>
                <span className="text-xs" style={{ color: '#5A5E6E' }}>Detect → parse → generate collection</span>
                {detecting && <span className="ml-auto inline-flex items-center gap-1.5 text-xs" style={{ color: '#8B5CF6' }}><Loader2 size={11} className="animate-spin" /> detecting</span>}
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#9FA3B5', letterSpacing: '0.06em' }}>Project folder</label>
                  <div className="flex gap-2">
                    <Input value={projectPath} onChange={(e)=>setProjectPath(e.target.value)} placeholder={isTauri() ? "/home/user/my-express-api" : "Requires Tauri desktop — Pick not available in browser"} className="flex-1" />
                    <Button variant="secondary" onClick={browseFolder} className="active:scale-[0.97] hover:border-[#2E2E36] shrink-0"><FolderSearch size={13} /> Browse</Button>
                    <Button variant="ghost" onClick={()=>detectFramework()} disabled={!projectPath || detecting} className="active:scale-[0.97] shrink-0">{detecting ? 'Detecting…' : 'Detect'}</Button>
                  </div>
                  {!isTauri() && <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: '#FBBF24' }}><AlertTriangle size={11} /> Browser preview cannot access filesystem — use <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>tauri dev</code> for source scanning.</p>}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#7A7F93', letterSpacing: '0.05em' }}>Base URL</label>
                    <Input value={baseUrl} onChange={(e)=>setBaseUrl(e.target.value)} placeholder="http://localhost:3000" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#7A7F93', letterSpacing: '0.05em' }}>API version prefix</label>
                    <Input value={apiVersion} onChange={(e)=>setApiVersion(e.target.value)} placeholder="v1  or  api/v1" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#7A7F93', letterSpacing: '0.05em' }}>Collection name</label>
                    <Input value={collectionName} onChange={(e)=>setCollectionName(e.target.value)} placeholder={sourceResult ? `${sourceResult.framework} API` : "My API"} />
                  </div>
                </div>

                {(detection || sourceResult) && (
                  <div className="p-3 animate-fadeUp space-y-2.5" style={{ background: '#070709', border: '1px solid #232329' }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-1 text-xs font-mono font-semibold" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.22)', color: '#8B5CF6' }}>{(detection ?? sourceResult)?.language ?? 'unknown'}</span>
                      <span className="text-sm font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.01em' }}>
                        Detected: {(detection ?? sourceResult)?.framework ?? 'Unknown'} <span style={{ color: '#9FA3B5', fontWeight: 400 }}>({Math.round(((detection ?? sourceResult)?.confidence ?? 0)*100)}% confidence)</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs tabular-nums" style={{ color: '#9FA3B5' }}>
                        <span className="h-1.5 w-16 overflow-hidden" style={{ background: '#121215', border: '1px solid #232329' }}>
                          <span className="block h-full" style={{ width: `${Math.round(((detection ?? sourceResult)?.confidence ?? 0)*100)}%`, background: ((detection ?? sourceResult)?.confidence ?? 0) >= 0.85 ? '#10B981' : ((detection ?? sourceResult)?.confidence ?? 0) < 0.6 ? '#F59E0B' : '#8B5CF6' }} />
                        </span>
                        {Math.round(((detection ?? sourceResult)?.confidence ?? 0)*100)}%
                      </span>
                      {sourceResult && <span className="ml-auto inline-flex items-center gap-1.5 text-xs tabular-nums" style={{ color: '#9FA3B5' }}><CheckCircle2 size={12} style={{ color: '#10B981' }} /> {sourceResult.totalFiles} files · {sourceResult.totalRoutes} routes</span>}
                    </div>
                    {detection?.rootFiles?.length ? <div className="text-xs" style={{ color: '#7A7F93' }}>Root: <code className="px-1.5 py-0.5 font-mono text-[11px]" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>{detection.rootFiles.slice(0,2).join(', ')}</code></div> : null}
                    {(() => {
                      const conf = (detection ?? sourceResult)?.confidence ?? 0;
                      if (conf >= 0.6) return null;
                      return (
                        <div className="flex flex-col gap-2 p-2.5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', color: '#FBBF24' }}>
                          <div className="flex items-start gap-2 text-xs leading-relaxed">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            <span><strong>Low confidence ({Math.round(conf*100)}%)</strong> — detection may be wrong. Force a framework to re-scan with a specific parser.</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium" style={{ color: '#E6E8F0' }}>Force framework:</label>
                            <select value={forcedFramework} onChange={(e) => setForcedFramework(e.target.value as BackendFramework | '')} className="flex-1 max-w-[220px] px-2 py-1.5 text-xs outline-none" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>
                              <option value="">Auto (detected)</option>
                              {(['Express','Fastify','NestJS','Flask','FastAPI','Django','Laravel','Symfony','SpringBoot','AspNetCore','Gin','Echo','Fiber','Rails','Actix','Axum','Unknown'] as BackendFramework[]).map(f => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                            <Button variant="secondary" size="sm" onClick={() => scanSource()} disabled={sourceScanning || !projectPath} className="shrink-0">Re-scan</Button>
                          </div>
                        </div>
                      );
                    })()}
                    {forcedFramework && (detection?.confidence ?? 0) < 0.6 && (
                      <div className="text-xs" style={{ color: '#8B5CF6' }}>Forcing <span className="font-mono font-semibold" style={{ color: '#E6E8F0' }}>{forcedFramework}</span> — next scan will use its parser.</div>
                    )}
                    {sourceResult?.warnings?.length ? <div className="flex gap-2 px-2.5 py-2 text-xs" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.20)', color: '#FBBF24' }}><AlertTriangle size={12} className="mt-0.5 shrink-0" /><span>{sourceResult.warnings.slice(0,2).map((w: any) => warningMessage(w)).join(' · ')}</span></div> : null}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={scanSource} disabled={sourceScanning || !projectPath} className="active:scale-[0.97] min-w-[124px]">
                    {sourceScanning ? <><Loader2 size={13} className="animate-spin" /> Scanning…</> : <><ScanLine size={13} /> Scan Routes</>}
                  </Button>
                  <Button variant="secondary" onClick={quickScan} disabled={sourceScanning || !projectPath} title="Scan + generate collection in one shot" className="active:scale-[0.97] hover:border-[#2E2E36]">
                    <Sparkles size={13} /> Quick Scan & Import
                  </Button>
                  {sourceResult && sourceResult.routes.length > 0 && (
                    <>
                      <Button variant="secondary" onClick={exportOpenApi} disabled={exportingOpenApi} className="ml-auto active:scale-[0.97] hover:border-[#2E2E36]">
                        <FileCode size={13} /> {exportingOpenApi ? 'Exporting…' : 'Export as OpenAPI'}
                      </Button>
                      <Button variant="primary" onClick={importSource} disabled={sourceImporting} className="active:scale-[0.97]">
                        <ImportIcon size={13} /> {sourceImporting ? 'Importing…' : `Import ${sourceResult.totalRoutes} routes`} <ArrowRight size={13} className="opacity-60" />
                      </Button>
                    </>
                  )}
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none ml-auto sm:ml-0" title="Watch route files for changes — auto re-scan">
                    <input type="checkbox" checked={isWatching} onChange={toggleWatch} disabled={!projectPath} className="h-3.5 w-3.5 accent-[#8B5CF6] disabled:opacity-40" />
                    <span style={{ color: isWatching ? '#10B981' : '#9FA3B5' }}>{isWatching ? 'Watching' : 'Watch for changes'}</span>
                    {isWatching && <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />}
                  </label>
                </div>

                {sourceScanning && (
                  <div className="space-y-2">
                    <div className="h-1 w-full overflow-hidden" style={{ background: '#121215', border: '1px solid #232329' }}>
                      <div className="h-full w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite]" style={{ background: '#8B5CF6' }} />
                    </div>
                    <div className="grid gap-1.5">
                      {[1,2,3,4].map(i=> <div key={i} className="h-10 skeleton" />)}
                    </div>
                  </div>
                )}

                {sourceError && <div className="px-3 py-2.5 text-sm animate-fadeUp" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: '#EF4444' }}>{sourceError}</div>}
                {importSuccess && <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm animate-fadeUp" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)', color: '#10B981' }}><span className="inline-flex items-center gap-1.5 truncate"><CheckCircle2 size={14} /> {importSuccess}</span><Button variant="ghost" size="sm" onClick={()=>{ void useCollectionStore.getState().load(); useUiStore.getState().setActivePage('collections'); }} className="active:scale-[0.97]">View in Collections <ArrowRight size={12} /></Button></div>}

                {sourceResult && (
                  <div className="animate-fadeUp">
                    <div className="sticky top-0 z-[1] mb-2 flex items-center justify-between gap-2 border-b px-1 py-2" style={{ background: '#0E0E10', borderColor: '#232329' }}>
                      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide" style={{ color: '#E6E8F0', letterSpacing: '0.04em' }}>
                        <Layers size={12} style={{ color: '#8B5CF6' }} /> Scanned routes
                        <span className="px-1.5 py-0.5 font-mono text-[11px] tabular-nums" style={{ background: '#121215', border: '1px solid #232329', color: '#9FA3B5' }}>{sourceResult.totalRoutes}</span>
                      </h3>
                      <span className="text-xs tabular-nums" style={{ color: '#5A5E6E' }}>{sourceResult.totalFiles} files</span>
                    </div>
                    {sourceResult.routes.length === 0 ? (
                      <div className="p-8 text-center" style={{ background: '#070709', border: '1px solid #232329' }}>
                        <p className="text-sm" style={{ color: '#9FA3B5' }}>No routes detected.</p>
                        <p className="mx-auto mt-1 max-w-md text-xs" style={{ color: '#5A5E6E' }}>Check framework detection or include tests checkbox. Warnings: {sourceResult.warnings.map((w: any) => warningMessage(w)).join('; ') || 'none'}</p>
                      </div>
                    ) : (
                      <div className="max-h-[420px] overflow-auto" style={{ background: '#070709', border: '1px solid #232329' }}>
                        {sourceResult.routes.map((r, i) => (
                          <div key={i} className="flex items-center gap-2.5 px-3 py-2 last:border-0 transition-colors hover:bg-[#0E0E10]" style={{ borderBottom: '1px solid #1E1E24' }}>
                            <span className="w-[64px] shrink-0 text-center font-mono text-[11px] font-bold tracking-wide px-1.5 py-1" style={{ background: '#121215', border: '1px solid #232329', color: methodColor(r.method) }}>{r.method}</span>
                            <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium" style={{ color: '#E6E8F0' }} title={r.path}>{r.path}</span>
                            <span className="hidden max-w-[160px] truncate text-xs lg:block" style={{ color: '#7A7F93' }} title={r.handler}>{r.handler}</span>
                            <span className="hidden max-w-[180px] truncate font-mono text-[11px] lg:block" style={{ color: '#5A5E6E' }} title={r.file}>{r.file.split(/[\\/]/).slice(-2).join('/')}:{r.line}</span>
                            {r.authRequired && <span className="flex h-5 w-5 shrink-0 items-center justify-center" style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.22)', color: '#FBBF24' }} title="Auth required"><Lock size={10} /></span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {sourceResult.routes.length > 0 && (
                      <div className="mt-3 p-3" style={{ background: '#070709', border: '1px solid #232329' }}>
                        <div className="mb-2 text-xs font-semibold tracking-wide" style={{ color: '#9FA3B5', letterSpacing: '0.04em' }}>Will generate folders:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {[...new Set(sourceResult.routes.map(r => {
                            const segs = r.path.split('/').filter(s=>s && !s.startsWith('{') && !s.startsWith(':'));
                            const skip = segs.findIndex(s=> !s.startsWith('v') && isNaN(Number(s)) && s!=='api');
                            const name = segs[skip>=0?skip:0] ?? 'Root';
                            return name.charAt(0).toUpperCase()+name.slice(1);
                          }))].slice(0,12).map(f=> <span key={f} className="px-2 py-1 text-xs font-medium" style={{ background: '#0E0E10', border: '1px solid #232329', color: '#9FA3B5' }}>{f}</span>)}
                        </div>
                        <div className="mt-2.5 text-xs leading-relaxed" style={{ color: '#5A5E6E' }}>Base URL <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>{baseUrl}</code> {apiVersion ? <>with version <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>{apiVersion}</code></> : ''} · files will be written as <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>~/APIForge/&lt;Framework&gt;/</code> (Tauri workspace)</div>
                      </div>
                    )}
                  </div>
                )}

                {scanDiff && (
                  <ScanDiffPanel diff={scanDiff} previousLabel={prevScanLabel} />
                )}

                {sourceResult && sourceResult.routes.length > 0 && (
                  <BolaCandidatesList routes={sourceResult.routes} baseUrl={baseUrl} />
                )}

                {sourceResult && sourceResult.routes.length > 0 && (
                  <CoveragePanel routes={sourceResult.routes} baseUrl={baseUrl} />
                )}

                <div className="flex items-start gap-2.5 p-3 text-xs leading-relaxed" style={{ background: '#070709', border: '1px dashed #232329', color: '#9FA3B5' }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ background: '#121215', border: '1px solid #232329', color: '#7A7F93' }}>
                    <Cpu size={12} />
                  </span>
                  <span>
                    <strong style={{ color: '#E6E8F0' }}>Pipeline:</strong> Detect framework → pick parser (Express / FastAPI / Laravel / Spring / ASP.NET / Gin / Generic) → regex AST → dedupe → generate <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>folders/*.request.yaml</code>. See <code className="px-1 py-0.5 font-mono" style={{ background: '#121215', border: '1px solid #232329', color: '#E6E8F0' }}>src-tauri/src/scanner/</code> for 15+ frameworks table.
                  </span>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
