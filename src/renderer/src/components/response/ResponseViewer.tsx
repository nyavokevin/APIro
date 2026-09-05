import { useState, useEffect } from 'react';
import { Clock, Upload, Keyboard, History, ArrowRight } from 'lucide-react';
import type { ResponseData, RequestData } from '@shared/types/request';
import { STATUS_CODE_COLORS } from '@shared/constants/methods';
import { JsonTree } from './JsonTree';
import { HeadersView } from './HeadersView';
import { HtmlPreview } from './HtmlPreview';
import { AIHelpButton } from '../ai/AIAssistant';
import { ResponseDiff } from '../testing/ResponseDiff';
import { useRequestStore } from '../../stores/requestStore';
import { useUiStore } from '../../stores/uiStore';
import { api } from '../../services/api';
import { inferSchema, diffSchemas } from '../../lib/testExecutor';
import { useNotificationStore } from '../../stores/notificationStore';

interface ResponseViewerProps {
  response: ResponseData | null;
  loading: boolean;
  request?: RequestData | null;
}

type View = 'preview' | 'body' | 'raw' | 'headers' | 'timeline' | 'diff';

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return STATUS_CODE_COLORS.success;
  if (code >= 300 && code < 400) return STATUS_CODE_COLORS.redirect;
  if (code >= 400 && code < 500) return STATUS_CODE_COLORS.clientError;
  if (code >= 500) return STATUS_CODE_COLORS.serverError;
  return '#8F909E';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isHtml(contentType: string, body: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('text/html')) return true;
  const trimmed = body.trim().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || trimmed.startsWith('<head') || trimmed.startsWith('<body');
}

export function ResponseViewer({ response, loading, request }: ResponseViewerProps) {
  const [view, setView] = useState<View>('body');
  const updateRequest = useRequestStore(s=>s.updateRequest);
  const activeTabId = useRequestStore(s=>s.activeTabId);

  if (loading) {
    return (
      <div
        className="flex h-full flex-col gap-3 p-4"
        style={{ border: '1px solid #232329', borderRadius: '0px', background: '#070709', margin: '14px 28px' }}
      >
        <div className="flex items-center gap-3">
          <div className="h-6 w-20 skeleton" style={{ borderRadius: '0px' }} />
          <div className="h-4 w-16 skeleton" />
          <div className="h-4 w-12 skeleton ml-auto" />
        </div>
        <div className="h-32 skeleton" />
        <div className="flex items-center gap-2 text-xs" style={{ color: '#7A7F93' }}>
          <span className="h-2 w-2 rounded-full bg-[#8B5CF6] animate-pulse" />
          Sending request… awaiting response
        </div>
      </div>
    );
  }

  if (!response) {
    return <EmptyResponseState request={request} />;
  }

  const parsed =
    response && (response.contentType.includes('json') || response.body.trim().startsWith('{') || response.body.trim().startsWith('['))
      ? tryParseJson(response.body)
      : null;
  const isNetworkError = !!response && (response.statusCode === 0 || !!response.error);
  const displayCode = isNetworkError ? 'ERR' : response ? response.statusCode : '—';
  const displayText = isNetworkError ? (response?.statusText || 'Network Error') : (response?.statusText || '');
  const color = isNetworkError ? '#EF4444' : response ? statusColor(response.statusCode) : '#8F909E';
  const html = response ? isHtml(response.contentType, response.body) : false;
  const effectiveView = view === 'body' && html && parsed === null ? 'preview' : view;
  // baseline for diff
  const lastKey = request ? `apiro.lastResponse.${request.id}` : '';
  const lastRaw = lastKey ? (()=>{ try{ return localStorage.getItem(lastKey); }catch{return null}})() : null;
  const lastParsed = lastRaw ? tryParseJson(lastRaw) : null;
  const drift = (() => {
    if (!request?.lockedSchema || !parsed) return [] as ReturnType<typeof diffSchemas>;
    try { return diffSchemas(request.lockedSchema as never, inferSchema(parsed) as never); } catch { return []; }
  })();

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: '#070709', border: '1px solid #232329', borderRadius: '0px', margin: '14px 28px', boxShadow: '0 1px 10px rgba(0,0,0,0.22)' }}
    >
      <div
        className="flex items-center gap-2.5 shrink-0 flex-wrap"
        style={{ background: '#121215', borderBottom: '1px solid #232329', padding: '8px 14px' }}
      >
        <span
          className="font-semibold tabular-nums inline-flex items-center gap-1.5"
          style={{ color, border: `1px solid ${color}55`, background: `${color}14`, borderRadius: '0px', padding: '3px 8px', fontSize: '12px', lineHeight: '16px', boxShadow: `0 0 8px ${color}22` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {displayCode} {displayText}
        </span>
        <span className="tabular-nums" style={{ fontSize: '12px', lineHeight: '16px', color: isNetworkError && response.responseTime === 0 ? '#5A5E6E' : '#9FA3B5' }}>{response.responseTime ? `${response.responseTime} ms` : isNetworkError ? '—' : '0 ms'}</span>
        <span className="tabular-nums hidden sm:inline" style={{ fontSize: '12px', lineHeight: '16px', color: isNetworkError && response.size === 0 ? '#5A5E6E' : '#7A7F93' }}>{response.size ? formatSize(response.size) : isNetworkError ? '—' : '0 B'}</span>
        <AIHelpButton request={request ?? null} response={response} />
        <button onClick={()=>{
          if(!request||!activeTabId||!parsed) return;
          const schema = inferSchema(parsed);
          updateRequest(activeTabId, { lockedSchema: schema as never } as Partial<RequestData>);
          try{ localStorage.setItem(lastKey, response.body); }catch{}
          useNotificationStore.getState().addToast({ variant:'success', title:'Schema verrouillé', description:'Le schéma de cette réponse 200 est maintenant la référence' });
          useNotificationStore.getState().addToast({ variant:'info', title:'Snapshot sauvegardé', description:'Comparaison future activée' });
        }} className="ml-1 px-2 py-1 text-xs bg-[#0E0E10] text-[#E6E8F0] hover:bg-[#19191E] active:scale-[0.98] transition-all border border-[#232329]" style={{borderRadius:'0px', fontSize:'11px', fontWeight:500}}>Lock schema</button>
        <button onClick={()=>{
          if(!request) return;
          try{ localStorage.setItem(lastKey, response.body); useNotificationStore.getState().addToast({ variant:'success', title:'Baseline sauvegardée', description:'Prochain run pourra utiliser “Compare to last run”' }); }catch{}
        }} className="px-2 py-1 text-xs bg-[#0E0E10] text-[#7A7F93] hover:bg-[#19191E] hover:text-[#E6E8F0] active:scale-[0.98] transition-all border border-[#232329]" style={{borderRadius:'0px', fontSize:'11px'}}>Save baseline</button>
        <div className="ml-auto flex gap-1 flex-wrap">
          {([
            ['preview', 'Preview'],
            ['body', 'Body'],
            ['raw', 'Raw'],
            ['headers', 'Headers'],
            ['timeline', 'Timeline'],
            ...(lastParsed ? [['diff','Diff'] as const] : []),
          ] as const).map(([v, label]) => {
            const disabled = v === 'preview' && !html;
            const isActive = effectiveView === v;
            return (
              <button
                key={v}
                onClick={() => !disabled && setView(v as View)}
                disabled={disabled}
                className="px-2.5 py-1 text-xs capitalize disabled:cursor-not-allowed disabled:opacity-40 transition-all active:scale-[0.97]"
                style={{
                  borderRadius: '0px',
                  background: isActive ? 'rgba(139,92,246,0.10)' : 'transparent',
                  color: isActive ? '#8B5CF6' : '#7A7F93',
                  borderLeft: isActive ? '2px solid #8B5CF6' : '2px solid transparent',
                  fontWeight: isActive ? 600 : 450,
                }}
                title={disabled ? 'No HTML content' : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {response.error && (
        <div className="flex items-start gap-2.5 px-3 py-3 text-xs leading-relaxed" style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.18)', borderLeft: '2px solid #EF4444', color: '#FCA5A5' }}>
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(239,68,68,0.14)] text-[#EF4444] border border-[rgba(239,68,68,0.28)]">!</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold" style={{ color: '#EF4444' }}>{displayText || 'Request failed'}</div>
            <div className="mt-1 break-words font-mono text-xs leading-relaxed" style={{ color: '#E6E8F0' }}>{response.error}</div>
            {response.body && response.body !== response.error && (
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-[#0E0E10] p-2 font-mono text-xs" style={{ border: '1px solid rgba(239,68,68,0.18)', color: '#FCA5A5' }}>{response.body.slice(0, 2000)}</pre>
            )}
          </div>
        </div>
      )}

      {drift.length>0 && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ background: 'rgba(251,191,36,0.08)', borderBottom:'1px solid #232329', borderLeft:'2px solid #FBBF24', color:'#FCD34D' }}>
          <span className="font-medium">⚠ Schema drift: {drift.length} changement(s)</span>
          <span className="hidden sm:inline" style={{ color: '#9FA3B5' }}>{drift.slice(0,3).map(d=>`${d.type} ${d.path}`).join(' · ')}{drift.length>3?' …':''}</span>
          <button onClick={()=>setView('diff')} className="ml-auto text-xs font-medium text-[#8B5CF6] hover:text-[#A78BFA] underline decoration-dotted">Voir diff</button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4" style={{ background: '#070709' }}>
        {effectiveView === 'diff' ? (
          lastParsed && parsed ? <ResponseDiff baseline={lastParsed} current={parsed} /> : <div className="text-xs text-[#8F909E]">Pas de baseline — cliquez “Save baseline” d’abord</div>
        ) : effectiveView === 'headers' ? (
          <HeadersView headers={response.headers} />
        ) : effectiveView === 'timeline' ? (
          <div className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div style={{ color: '#7A7F93' }}>TTFB: <span className="tabular-nums" style={{ color: '#E6E8F0' }}>{response.timeline.ttfb} ms</span></div>
              <div style={{ color: '#7A7F93' }}>Download: <span className="tabular-nums" style={{ color: '#E6E8F0' }}>{response.timeline.download} ms</span></div>
              <div style={{ color: '#7A7F93' }}>Total: <span className="tabular-nums font-semibold" style={{ color: '#E6E8F0' }}>{response.timeline.total} ms</span></div>
              <div style={{ color: '#7A7F93' }}>Size: <span className="tabular-nums" style={{ color: '#E6E8F0' }}>{formatSize(response.size)}</span></div>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden flex bg-[#121215]" style={{ border: '1px solid #232329', borderRadius: '9999px' }}>
              <div className="bg-[#8B5CF6]" style={{ width: `${Math.min(100, (response.timeline.ttfb / Math.max(1, response.timeline.total)) * 100)}%`, borderRadius: '9999px' }} />
              <div className="bg-[#8B5CF6] opacity-60" style={{ width: `${Math.min(100, (response.timeline.download / Math.max(1, response.timeline.total)) * 100)}%`, borderRadius: '9999px' }} />
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-[#7A7F93] bg-[#121215] p-3 border border-[#232329]" style={{ fontSize: '11px', borderRadius: '0px' }}>{JSON.stringify(response.timeline, null, 2)}</pre>
          </div>
        ) : effectiveView === 'preview' && html ? (
          <div className="h-full w-full overflow-hidden bg-white" style={{ border: '1px solid #232329', borderRadius: '0px' }}>
            <HtmlPreview html={response.body} />
          </div>
        ) : effectiveView === 'raw' ? (
          <pre className="whitespace-pre-wrap break-all font-mono text-sm p-3 bg-[#0E0E10] border border-[#232329]" style={{ color: '#E6E8F0' }}>
            {response.body}
          </pre>
        ) : parsed !== null ? (
          <JsonTree data={parsed} />
        ) : (
          <pre className="whitespace-pre-wrap break-all font-mono text-sm p-3 bg-[#0E0E10] border border-[#232329]" style={{ color: '#E6E8F0' }}>
            {response.body}
          </pre>
        )}
      </div>
    </div>
  );
}

function EmptyResponseState({ request: _request }: { request?: RequestData | null }) {
  const [recent, setRecent] = useState<Array<{ method: string; url: string; status: number | null; ts: number }>>([]);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await api.requests.history(5);
        if (cancelled) return;
        setRecent(
          items.slice(0, 3).map((h) => ({
            method: h.method,
            url: h.url,
            status: h.statusCode,
            ts: h.timestamp,
          }))
        );
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openRecent = async (url: string, method: string) => {
    try {
      const items = await api.requests.history(20);
      const found = items.find((h) => h.url === url && h.method === method);
      if (!found) return;
      const { uid } = await import('../../lib/id');
      const { HTTP_METHODS } = await import('@shared/constants/methods');
      let headers: any[] = [];
      try {
        const p = JSON.parse(found.requestHeaders || '[]');
        if (Array.isArray(p)) headers = p;
      } catch {}
      let params: any[] = [];
      try {
        const p = JSON.parse((found as any).requestParams || '[]');
        if (Array.isArray(p)) params = p;
      } catch {}
      params = params.map((p: any) => ({ id: p.id ?? uid(), key: p.key ?? '', value: p.value ?? '', enabled: p.enabled ?? true }));
      const body = (found as any).requestBody ?? '';
      const bodyType = (found as any).requestBodyType ?? 'none';
      const m = (HTTP_METHODS as string[]).includes(found.method) ? (found.method as RequestData['method']) : 'GET';
      useRequestStore.getState().openRequest({
        id: uid(),
        name: `${found.method} ${found.url}`,
        method: m,
        url: found.url,
        headers,
        params,
        bodyType: (['none','json','xml','text','form-data','urlencoded','binary','graphql'] as string[]).includes(bodyType as string) ? (bodyType as RequestData['bodyType']) : 'none',
        body: body ?? '',
        auth: { type: 'none' },
      });
    } catch {}
  };

  return (
    <div
      className="flex h-full flex-col overflow-auto p-5"
      style={{ background: '#070709', border: '1px solid #232329', borderRadius: '0px', margin: '14px 28px' }}
    >
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
        <div className="border border-dashed bg-[#0E0E10] p-4 relative overflow-hidden" style={{ borderColor: '#232329', borderRadius: '0px' }}>
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(400px 120px at 20% 0%, #8B5CF6, transparent)' }} />
          <div className="relative flex items-center gap-2.5 text-sm font-semibold" style={{ color: '#E6E8F0', letterSpacing: '-0.015em' }}>
            <span className="flex h-7 w-7 items-center justify-center bg-[rgba(139,92,246,0.10)] text-[#8B5CF6] border border-[rgba(139,92,246,0.18)]">
              <ArrowRight size={13} strokeWidth={1.9} />
            </span>
            No response yet
            <span className="ml-auto hidden sm:flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 bg-[#121215] border border-[#232329] text-[#7A7F93]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8B5CF6] animate-pulse" /> Ready to send
            </span>
          </div>
          <p className="relative mt-2 text-[13px] leading-relaxed" style={{ color: '#9FA3B5' }}>
            Send the request above to see status, headers, body and timeline here. This area also shows schema drift and AI help.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="border bg-[#121215] p-3.5 hover:border-[#2E2E36] transition-colors" style={{ borderColor: '#232329' }}>
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#E6E8F0', letterSpacing: '-0.01em' }}>
              <Keyboard size={13} className="text-[#8B5CF6]" /> Shortcuts
            </div>
            <div className="space-y-1.5 font-mono text-xs" style={{ color: '#9FA3B5' }}>
              <div className="flex items-center justify-between gap-2">
                <span>Send</span>
                <span className="rounded bg-[#1A1A1E] px-1.5 py-0.5 text-[11px] font-medium text-[#E6E8F0] border border-[#232329]">
                  {mod}+Enter
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>New tab</span>
                <span className="rounded bg-[#1A1A1E] px-1.5 py-0.5 text-[11px] font-medium text-[#E6E8F0] border border-[#232329]">
                  {mod}+N
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Command</span>
                <span className="rounded bg-[#1A1A1E] px-1.5 py-0.5 text-[11px] font-medium text-[#E6E8F0] border border-[#232329]">
                  {mod}+K
                </span>
              </div>
            </div>
          </div>

          <div className="border bg-[#121215] p-3.5 hover:border-[#2E2E36] transition-colors" style={{ borderColor: '#232329' }}>
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#E6E8F0' }}>
              <History size={13} className="text-[#8B5CF6]" /> Recent
            </div>
            {recent.length === 0 ? (
              <p className="text-xs leading-relaxed" style={{ color: '#7A7F93' }}>
                No history yet — your last 3 requests will appear here for one-click reopen.
              </p>
            ) : (
              <div className="space-y-1">
                {recent.map((r) => (
                  <button
                    key={`${r.method}-${r.url}-${r.ts}`}
                    onClick={() => void openRecent(r.url, r.method)}
                    className="flex w-full items-center gap-2 truncate px-2 py-1.5 text-left font-mono text-xs hover:bg-[#19191E] active:bg-[#1E1E24] border border-transparent hover:border-[#232329] transition-colors"
                    title={`${r.method} ${r.url}`}
                  >
                    <span className="shrink-0 text-[10px] font-bold tracking-wide" style={{ color: r.status != null && r.status < 400 ? '#10B981' : r.status != null ? '#EF4444' : '#7A7F93' }}>
                      {r.method}
                    </span>
                    <span className="min-w-0 flex-1 truncate" style={{ color: '#E6E8F0' }}>{r.url}</span>
                    <Clock size={10} className="shrink-0" style={{ color: '#7A7F93' }} />
                  </button>
                ))}
                <button
                  onClick={() => useUiStore.getState().setActivePage('history')}
                  className="mt-1.5 text-xs font-medium text-[#8B5CF6] hover:text-[#A78BFA] hover:underline"
                >
                  View all history →
                </button>
              </div>
            )}
          </div>

          <div className="border bg-[#121215] p-3.5 hover:border-[#2E2E36] transition-colors" style={{ borderColor: '#232329' }}>
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#E6E8F0' }}>
              <Upload size={13} className="text-[#8B5CF6]" /> Quick start
            </div>
            <div className="space-y-2.5 text-xs" style={{ color: '#9FA3B5' }}>
              <p className="leading-relaxed">Import an existing collection to get started fast.</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => useUiStore.getState().setActivePage('collections')}
                  className="px-2.5 py-1.5 text-xs font-medium bg-[#1A1A1E] text-[#E6E8F0] border border-[#232329] hover:bg-[#232329] active:scale-[0.98] transition-all"
                  style={{ borderRadius: '0px' }}
                >
                  Import collection
                </button>
                <button
                  onClick={() => useRequestStore.getState().newTab()}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-[#8B5CF6] text-white hover:bg-[#7C3AED] active:scale-[0.98] transition-all"
                  style={{ border: '1px solid transparent', boxShadow: '0 0 10px rgba(139,92,246,0.25)' }}
                >
                  New request
                </button>
              </div>
              <p className="pt-1 text-[11px]" style={{ color: '#7A7F93' }}>Tip: paste a cURL in Collections → Import.</p>
            </div>
          </div>
        </div>

        <div className="border bg-[#0E0E10] px-3.5 py-2.5 text-xs flex items-start gap-2" style={{ borderColor: '#232329', color: '#9FA3B5' }}>
          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#8B5CF6] shrink-0" style={{ boxShadow: '0 0 6px rgba(139,92,246,0.35)' }} />
          <span><span className="font-semibold" style={{ color: '#E6E8F0' }}>Pro tip:</span> Use <span className="font-mono bg-[#121215] px-1.5 py-0.5 text-[11px] text-[#E6E8F0] border border-[#232329]">{`{{var}}`}</span> in URL/headers/body with an environment (top-right) for quick switching between Local → Staging → Prod.</span>
        </div>
      </div>
    </div>
  );
}
