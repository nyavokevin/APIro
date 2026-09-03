import { useState } from 'react';
import type { ResponseData, RequestData } from '@shared/types/request';
import { STATUS_CODE_COLORS } from '@shared/constants/methods';
import { JsonTree } from './JsonTree';
import { HeadersView } from './HeadersView';
import { HtmlPreview } from './HtmlPreview';
import { AIHelpButton } from '../ai/AIAssistant';
import { ResponseDiff } from '../testing/ResponseDiff';
import { useRequestStore } from '../../stores/requestStore';
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
        className="flex h-full items-center justify-center text-sm bg-[#000000]"
        style={{ border: '1px solid #262626', borderRadius: '0px', color: '#8F909E', margin: '16px 32px' }}
      >
        Sending request…
      </div>
    );
  }

  if (!response) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm bg-[#000000]"
        style={{ border: '1px solid #262626', borderRadius: '0px', color: '#8F909E', margin: '16px 32px' }}
      >
        Send a request to see the response.
      </div>
    );
  }

  const parsed =
    response && (response.contentType.includes('json') || response.body.trim().startsWith('{') || response.body.trim().startsWith('['))
      ? tryParseJson(response.body)
      : null;
  const color = response ? statusColor(response.statusCode) : '#8F909E';
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
      className="flex h-full flex-col bg-[#000000] overflow-hidden"
      style={{ border: '1px solid #262626', borderRadius: '0px', margin: '16px 32px' }}
    >
      <div
        className="flex items-center gap-3 shrink-0 bg-[#121212]"
        style={{ borderBottom: '1px solid #262626', padding: '8px 16px' }}
      >
        <span
          className="font-semibold"
          style={{ color, border: `1px solid ${color}`, borderRadius: '0px', padding: '2px 8px', fontSize: '12px', lineHeight: '16px' }}
        >
          {response.statusCode} {response.statusText}
        </span>
        <span style={{ fontSize: '12px', lineHeight: '16px', color: '#8F909E' }}>{response.responseTime} ms</span>
        <span style={{ fontSize: '12px', lineHeight: '16px', color: '#8F909E' }}>{formatSize(response.size)}</span>
        {response.error && (
          <span className="max-w-[260px] truncate" style={{ color: '#EF4444', fontSize: '12px' }} title={response.error}>Error: {response.error}</span>
        )}
        <AIHelpButton request={request ?? null} response={response} />
        <button onClick={()=>{
          if(!request||!activeTabId||!parsed) return;
          const schema = inferSchema(parsed);
          updateRequest(activeTabId, { lockedSchema: schema as never } as Partial<RequestData>);
          try{ localStorage.setItem(lastKey, response.body); }catch{}
          useNotificationStore.getState().addToast({ variant:'success', title:'Schema verrouillé', description:'Le schéma de cette réponse 200 est maintenant la référence' });
          useNotificationStore.getState().addToast({ variant:'info', title:'Snapshot sauvegardé', description:'Comparaison future activée' });
        }} className="ml-2 px-2 py-1 text-xs bg-[#121212] text-[#E2E8F0] hover:bg-[#1A1A1A]" style={{border:'1px solid #262626', borderRadius:'0px', fontSize:'11px'}}>Lock schema</button>
        <button onClick={()=>{
          if(!request) return;
          try{ localStorage.setItem(lastKey, response.body); useNotificationStore.getState().addToast({ variant:'success', title:'Baseline sauvegardée', description:'Prochain run pourra utiliser “Compare to last run”' }); }catch{}
        }} className="px-2 py-1 text-xs bg-[#121212] text-[#8F909E] hover:bg-[#1A1A1A]" style={{border:'1px solid #262626', borderRadius:'0px', fontSize:'11px'}}>Save baseline</button>
        <div className="ml-2 flex gap-1">
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
                className="px-2 py-1 text-xs capitalize disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderRadius: '0px',
                  background: isActive ? 'rgba(139,92,246,0.10)' : 'transparent',
                  color: isActive ? '#8B5CF6' : '#8F909E',
                  borderLeft: isActive ? '2px solid #8B5CF6' : '2px solid transparent',
                }}
                title={disabled ? 'No HTML content' : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {drift.length>0 && (
        <div className="flex items-center gap-2 bg-[rgba(251,191,36,0.10)] px-3 py-2 text-xs" style={{ borderBottom:'1px solid #262626', borderLeft:'2px solid #FBBF24', color:'#FBBF24' }}>
          <span>⚠ Schema drift: {drift.length} changement(s) depuis le lock</span>
          <span className="text-[#8F909E]">{drift.slice(0,3).map(d=>`${d.type} ${d.path}`).join(' · ')}{drift.length>3?' …':''}</span>
          <button onClick={()=>setView('diff')} className="ml-auto text-xs text-[#8B5CF6] underline">Voir diff</button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4 bg-[#000000]">
        {effectiveView === 'diff' ? (
          lastParsed && parsed ? <ResponseDiff baseline={lastParsed} current={parsed} /> : <div className="text-xs text-[#8F909E]">Pas de baseline — cliquez “Save baseline” d’abord</div>
        ) : effectiveView === 'headers' ? (
          <HeadersView headers={response.headers} />
        ) : effectiveView === 'timeline' ? (
          <div className="space-y-2 font-mono text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div style={{ color: '#8F909E' }}>TTFB: <span style={{ color: '#E2E8F0' }}>{response.timeline.ttfb} ms</span></div>
              <div style={{ color: '#8F909E' }}>Download: <span style={{ color: '#E2E8F0' }}>{response.timeline.download} ms</span></div>
              <div style={{ color: '#8F909E' }}>Total: <span style={{ color: '#E2E8F0' }}>{response.timeline.total} ms</span></div>
              <div style={{ color: '#8F909E' }}>Size: <span style={{ color: '#E2E8F0' }}>{formatSize(response.size)}</span></div>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden flex bg-[#121212]" style={{ border: '1px solid #262626' }}>
              <div className="bg-[#8B5CF6]" style={{ width: `${Math.min(100, (response.timeline.ttfb / Math.max(1, response.timeline.total)) * 100)}%` }} />
              <div className="bg-[#8B5CF6] opacity-60" style={{ width: `${Math.min(100, (response.timeline.download / Math.max(1, response.timeline.total)) * 100)}%` }} />
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-[#8F909E]" style={{ fontSize: '12px' }}>{JSON.stringify(response.timeline, null, 2)}</pre>
          </div>
        ) : effectiveView === 'preview' && html ? (
          <div className="h-full w-full overflow-hidden bg-white" style={{ border: '1px solid #262626', borderRadius: '0px' }}>
            <HtmlPreview html={response.body} />
          </div>
        ) : effectiveView === 'raw' ? (
          <pre className="whitespace-pre-wrap break-all font-mono text-sm text-[#E2E8F0]">
            {response.body}
          </pre>
        ) : parsed !== null ? (
          <JsonTree data={parsed} />
        ) : (
          <pre className="whitespace-pre-wrap break-all font-mono text-sm text-[#E2E8F0]">
            {response.body}
          </pre>
        )}
      </div>
    </div>
  );
}
