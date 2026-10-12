import { useMemo, useState } from 'react';
import { Radar, Search, Loader2, Globe, ExternalLink, ShieldCheck, FolderPlus, AlertTriangle, CheckSquare, Square } from 'lucide-react';
import type { RequestData } from '@shared/types/request';
import { api } from '../services/api';
import { newRequestData } from '../stores/workspaceStore';
import { useRequestStore } from '../stores/requestStore';
import { useUiStore } from '../stores/uiStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useNotificationStore } from '../stores/notificationStore';
import { Button } from '../components/ui/Button';
import {
  extractEndpoints,
  extractScriptSrcs,
  dedupeEndpoints,
  type DiscoveredEndpoint,
  type DiscoveryConfidence,
} from '../lib/discovery/extractApis';

const MAX_SCRIPTS = 12;

const METHOD_COLOR: Record<string, string> = {
  GET: '#10B981', POST: '#8B5CF6', PUT: '#F59E0B', PATCH: '#F59E0B', DELETE: '#EF4444',
  HEAD: '#60A5FA', OPTIONS: '#60A5FA', TRACE: '#7A7F93',
};
const CONFIDENCE_COLOR: Record<DiscoveryConfidence, string> = { high: '#10B981', medium: '#F59E0B', low: '#7A7F93' };

interface DiscoveryResult {
  pageUrl: string;
  endpoints: DiscoveredEndpoint[];
  scriptsScanned: number;
  totalScripts: number;
}

function keyOf(e: DiscoveredEndpoint): string {
  return `${e.method} ${e.url}`;
}

function normalizeUrl(input: string): string {
  const t = input.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function toRequest(e: DiscoveredEndpoint): RequestData {
  return {
    ...newRequestData(`${e.method} ${e.path}`),
    method: e.method,
    url: e.url,
    bodyType: e.kind === 'graphql' ? 'graphql' : 'none',
  };
}

export function SiteAudit() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const openRequest = useRequestStore((s) => s.openRequest);
  const setActivePage = useUiStore((s) => s.setActivePage);
  const createCollection = useWorkspaceStore((s) => s.createCollection);
  const toast = useNotificationStore((s) => s.addToast);

  const selectedEndpoints = useMemo(
    () => (result ? result.endpoints.filter((e) => selected.has(keyOf(e))) : []),
    [result, selected]
  );

  const fetchText = async (target: string): Promise<{ body: string; status: number }> => {
    const req: RequestData = { ...newRequestData(`GET ${target}`), method: 'GET', url: target };
    const res = await api.requests.execute(req, []);
    return { body: res.body ?? '', status: res.statusCode };
  };

  const runDiscovery = async () => {
    if (!url.trim()) {
      toast({ variant: 'warning', title: 'Enter a URL', description: 'e.g. https://example.com' });
      return;
    }
    const pageUrl = normalizeUrl(url);
    let origin: string;
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      toast({ variant: 'error', title: 'Invalid URL', description: pageUrl });
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(new Set());
    setProgress('Fetching page…');
    try {
      const page = await fetchText(pageUrl);
      if (page.status === 0) {
        setError(`Could not fetch ${pageUrl}. The site may be unreachable or blocking requests.`);
        return;
      }

      const collected: DiscoveredEndpoint[] = extractEndpoints(page.body, pageUrl, 'html');

      const scripts = extractScriptSrcs(page.body, pageUrl);
      const sameOrigin = scripts.filter((s) => s.startsWith(origin)).slice(0, MAX_SCRIPTS);
      for (let i = 0; i < sameOrigin.length; i += 1) {
        setProgress(`Scanning script ${i + 1}/${sameOrigin.length}…`);
        try {
          const js = await fetchText(sameOrigin[i]);
          collected.push(...extractEndpoints(js.body, sameOrigin[i], 'script'));
        } catch {
          /* skip unreachable script */
        }
      }

      const endpoints = dedupeEndpoints(collected);
      setResult({ pageUrl, endpoints, scriptsScanned: sameOrigin.length, totalScripts: scripts.length });
      // Pre-select the confident ones.
      setSelected(new Set(endpoints.filter((e) => e.confidence !== 'low').map(keyOf)));
      toast({
        variant: endpoints.length ? 'success' : 'info',
        title: endpoints.length ? `Discovered ${endpoints.length} endpoint(s)` : 'No endpoints found',
        description: `${sameOrigin.length} script(s) scanned`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const toggle = (e: DiscoveredEndpoint) => {
    const k = keyOf(e);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const allSelected = !!result && result.endpoints.length > 0 && selected.size === result.endpoints.length;
  const toggleAll = () => {
    if (!result) return;
    setSelected(allSelected ? new Set() : new Set(result.endpoints.map(keyOf)));
  };

  const openInWorkspace = () => {
    if (selectedEndpoints.length === 0) return;
    for (const e of selectedEndpoints) openRequest(toRequest(e));
    setActivePage('workspace');
    toast({ variant: 'success', title: `Opened ${selectedEndpoints.length} request(s)`, description: 'Sent to Workspace' });
  };

  const sendToAudit = () => {
    if (selectedEndpoints.length === 0) return;
    for (const e of selectedEndpoints) openRequest(toRequest(e));
    setActivePage('security');
    toast({
      variant: 'info',
      title: `${selectedEndpoints.length} request(s) ready`,
      description: 'Run "Full audit" on the Security page to test them.',
    });
  };

  const importAsCollection = async () => {
    if (selectedEndpoints.length === 0) return;
    try {
      const host = (() => { try { return new URL(result!.pageUrl).host; } catch { return 'Discovered'; } })();
      const folder = await createCollection({ name: `${host} (discovered)`, type: 'folder' });
      for (const e of selectedEndpoints) {
        const data = toRequest(e);
        await createCollection({ name: data.name, type: 'request', parentId: folder.id, data });
      }
      toast({ variant: 'success', title: 'Imported to Collections', description: `${selectedEndpoints.length} request(s) under "${host}"` });
    } catch (e) {
      toast({ variant: 'error', title: 'Import failed', description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#070709]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 shrink-0 px-6 py-4" style={{ borderBottom: '1px solid #232329' }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[rgba(139,92,246,0.12)] text-[#8B5CF6]" style={{ border: '1px solid rgba(139,92,246,0.22)' }}>
          <Radar size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-tight text-[#E6E8F0]" style={{ letterSpacing: '-0.02em' }}>API Discovery</h1>
          <p className="mt-0.5 text-xs text-[#7A7F93]">Crawl a website's page and scripts to find the APIs it calls, then import or audit them.</p>
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 bg-[#0E0E10] px-6 py-4" style={{ borderBottom: '1px solid #232329' }}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[280px] flex-1">
            <Globe size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7F93]" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) void runDiscovery(); }}
              placeholder="https://example.com"
              className="h-10 w-full bg-[#121215] pl-9 pr-3 font-mono text-sm text-[#E6E8F0] placeholder:text-[#5A5E6E] outline-none transition-colors focus:border-[#8B5CF6]"
              style={{ border: '1px solid #232329' }}
            />
          </div>
          <Button variant="primary" onClick={() => void runDiscovery()} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} {loading ? 'Scanning…' : 'Discover APIs'}
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#7A7F93]">
          <AlertTriangle size={11} className="text-[#F59E0B]" /> Discovery is read-only (GET requests). Only scan and audit sites you are authorized to test.
        </p>
        {progress && (
          <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-[#C4B5FD]"><Loader2 size={12} className="animate-spin" /> {progress}</p>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 text-xs" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" style={{ border: '1px dashed #232329', background: '#0E0E10' }}>
            <Radar size={28} className="text-[#7A7F93]" strokeWidth={1.4} />
            <p className="text-sm font-medium text-[#E6E8F0]">Discover a site's API surface</p>
            <p className="max-w-[46ch] text-xs leading-relaxed text-[#7A7F93]">
              Enter a URL. APIro fetches the page and its same-origin scripts, extracts the endpoints they call (fetch / axios / XHR + API-shaped URLs), and lists them for import or a security audit.
            </p>
          </div>
        )}

        {result && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#9FA3B5]">
              <span className="bg-[#121215] px-2 py-1 font-mono tabular-nums" style={{ border: '1px solid #232329' }}>{result.endpoints.length} endpoint(s)</span>
              <span className="bg-[#121215] px-2 py-1 font-mono tabular-nums" style={{ border: '1px solid #232329' }}>{result.scriptsScanned}/{result.totalScripts} script(s) scanned</span>
              <span className="bg-[#121215] px-2 py-1 font-mono tabular-nums" style={{ border: '1px solid #232329' }}>{selected.size} selected</span>
            </div>

            {result.endpoints.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#7A7F93]">No API calls found in the page or its scripts. Endpoints loaded dynamically may need the app running.</div>
            ) : (
              <div style={{ border: '1px solid #232329' }}>
                <div className="flex items-center gap-2 bg-[#0E0E10] px-3 py-2" style={{ borderBottom: '1px solid #232329' }}>
                  <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs font-medium text-[#9FA3B5] hover:text-[#E6E8F0]">
                    {allSelected ? <CheckSquare size={14} className="text-[#8B5CF6]" /> : <Square size={14} />} Select all
                  </button>
                </div>
                <ul>
                  {result.endpoints.map((e) => {
                    const k = keyOf(e);
                    const isSel = selected.has(k);
                    return (
                      <li key={k} className="flex items-center gap-3 px-3 py-2 hover:bg-[#121215]" style={{ borderBottom: '1px solid #16161A' }}>
                        <button onClick={() => toggle(e)} className="shrink-0 text-[#7A7F93] hover:text-[#8B5CF6]" aria-label="Toggle">
                          {isSel ? <CheckSquare size={15} className="text-[#8B5CF6]" /> : <Square size={15} />}
                        </button>
                        <span className="w-16 shrink-0 font-mono text-xs font-semibold" style={{ color: METHOD_COLOR[e.method] ?? '#7A7F93' }}>{e.method}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#E6E8F0]" title={e.url}>{e.path}</span>
                        <span className="hidden shrink-0 truncate font-mono text-xs text-[#7A7F93] md:inline" style={{ maxWidth: 160 }}>{e.host}</span>
                        {e.kind === 'graphql' && <span className="shrink-0 bg-[rgba(139,92,246,0.12)] px-1.5 py-0.5 font-mono text-xs text-[#C4B5FD]">GQL</span>}
                        <span className="shrink-0 font-mono text-xs" style={{ color: CONFIDENCE_COLOR[e.confidence] }} title={e.evidence}>{e.confidence}</span>
                        <span className="hidden shrink-0 text-xs text-[#5A5E6E] lg:inline">{e.source}</span>
                        <button
                          onClick={() => { openRequest(toRequest(e)); setActivePage('workspace'); }}
                          className="shrink-0 p-1 text-[#7A7F93] hover:text-[#8B5CF6]"
                          title="Open in Workspace"
                        >
                          <ExternalLink size={13} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      {result && result.endpoints.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 bg-[#0E0E10] px-6 py-3" style={{ borderTop: '1px solid #232329' }}>
          <span className="text-xs text-[#7A7F93]">{selectedEndpoints.length} selected</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void importAsCollection()} disabled={selectedEndpoints.length === 0}>
              <FolderPlus size={14} /> Import as Collection
            </Button>
            <Button variant="secondary" size="sm" onClick={openInWorkspace} disabled={selectedEndpoints.length === 0}>
              <ExternalLink size={14} /> Open in Workspace
            </Button>
            <Button variant="primary" size="sm" onClick={sendToAudit} disabled={selectedEndpoints.length === 0}>
              <ShieldCheck size={14} /> Send to Security audit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
