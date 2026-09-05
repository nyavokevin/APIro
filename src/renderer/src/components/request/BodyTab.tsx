import { useState, useMemo } from 'react';
import { Dices, Wand2, Braces, Info } from 'lucide-react';
import type { RequestBodyType, RequestData } from '@shared/types/request';
import { Button } from '../ui/Button';
import { CodeEditor } from '../ui/CodeEditor';

interface BodyTabProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

const BODY_TYPES: RequestBodyType[] = [
  'none',
  'json',
  'xml',
  'text',
  'form-data',
  'urlencoded',
  'graphql',
];

function formatJson(value: string, tabSize = 2): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, tabSize);
  } catch {
    return null;
  }
}

function formatXml(value: string, tabSize = 2): string | null {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith('<')) return null;
  try {
    const indent = ' '.repeat(tabSize);
    let formatted = '';
    let pad = 0;
    const tokens = trimmed.replace(/>\s*</g, '><').split(/(<[^>]+>)/g).filter(Boolean);
    for (const token of tokens) {
      if (!token.trim()) continue;
      if (token.startsWith('</')) {
        pad = Math.max(0, pad - 1);
        formatted += indent.repeat(pad) + token + '\n';
      } else if (token.startsWith('<') && token.endsWith('/>')) {
        formatted += indent.repeat(pad) + token + '\n';
      } else if (token.startsWith('<')) {
        formatted += indent.repeat(pad) + token + '\n';
        if (!token.endsWith('/>')) pad += 1;
      } else {
        const text = token.trim();
        if (text) formatted += indent.repeat(pad) + text + '\n';
      }
    }
    return formatted.trim();
  } catch {
    return null;
  }
}

function getLanguage(bodyType: RequestBodyType): 'json' | 'xml' | 'graphql' | 'text' {
  if (bodyType === 'json') return 'json';
  if (bodyType === 'xml') return 'xml';
  if (bodyType === 'graphql') return 'graphql';
  return 'text';
}
function getTabSizeForType(bodyType: RequestBodyType): number {
  if (bodyType === 'json' || bodyType === 'graphql' || bodyType === 'xml') return 2;
  return 2;
}

export function BodyTab({ request, onChange }: BodyTabProps) {
  const [seeding, setSeeding] = useState(false);
  const [seedCount, setSeedCount] = useState(1);
  const [tabSize, setTabSize] = useState(() => getTabSizeForType(request.bodyType));
  const language = useMemo(() => getLanguage(request.bodyType), [request.bodyType]);
  const canFormat = useMemo(() => {
    if (request.bodyType === 'none' || !request.body.trim()) return false;
    if (request.bodyType === 'json' || request.bodyType === 'graphql') return formatJson(request.body, tabSize) !== null;
    if (request.bodyType === 'xml') return formatXml(request.body, tabSize) !== null;
    return formatJson(request.body, tabSize) !== null || formatXml(request.body, tabSize) !== null;
  }, [request.body, request.bodyType, tabSize]);

  const handleFormat = () => {
    const trimmed = request.body.trim();
    if (!trimmed) return;
    let formatted: string | null = null;
    if (request.bodyType === 'json' || request.bodyType === 'graphql') {
      formatted = formatJson(request.body, tabSize);
      if (!formatted && request.bodyType === 'graphql') {
        formatted = formatJson(trimmed, tabSize);
      }
    }
    if (!formatted && request.bodyType === 'xml') {
      formatted = formatXml(request.body, tabSize);
    }
    if (!formatted) {
      formatted = formatJson(request.body, tabSize) ?? formatXml(request.body, tabSize);
    }
    if (formatted && formatted !== request.body) {
      onChange({ body: formatted });
      import('../../stores/notificationStore').then(({ useNotificationStore }) => {
        useNotificationStore.getState().addToast({ variant: 'success', title: 'Formatted', description: `${request.bodyType} · ${tabSize} spaces · ${formatted!.split('\n').length} lines` });
      });
    } else if (!formatted) {
      import('../../stores/notificationStore').then(({ useNotificationStore }) => {
        useNotificationStore.getState().addToast({ variant: 'warning', title: 'Nothing to format', description: 'Body is not valid JSON/XML' });
      });
    }
  };

  const seedBody = async () => {
    if (!request.body) return;
    setSeeding(true);
    try {
      const { generateBulkSeed } = await import('@main/services/seed-generator');
      const generated = generateBulkSeed(request.body, { strategy: request.seedStrategy || 'overwrite', count: seedCount });
      let finalBody = generated;
      if (request.bodyType === 'json' || request.bodyType === 'graphql') {
        const pretty = formatJson(generated, tabSize);
        if (pretty) finalBody = pretty;
      }
      onChange({ body: finalBody });
      const { useNotificationStore } = await import('../../stores/notificationStore');
      useNotificationStore.getState().addToast({ variant:'success', title:'Seeded', description:`Generated ${seedCount>1?seedCount+' items':'bulk'} · strategy ${request.seedStrategy||'overwrite'}` });
      try { const { pushSeedSnapshot } = await import('../../lib/seedHistory'); pushSeedSnapshot(request.id, finalBody); } catch {}
    } finally {
      setSeeding(false);
    }
  };

function SeedSnapshots({ requestId, onRestore }:{ requestId:string; onRestore:(b:string)=>void }){
  const snapshots = (()=>{ try{ const { getSeedSnapshots } = require('../../lib/seedHistory'); return getSeedSnapshots(requestId) as import('../../lib/seedHistory').SeedSnapshot[]; }catch{ return [] as import('../../lib/seedHistory').SeedSnapshot[]; }})();
  return (
    <div className="mt-3 flex items-center gap-2 overflow-auto border-t pt-3 text-xs" style={{ borderColor: '#232329' }}>
      <span className="shrink-0 font-medium tracking-[-0.01em]" style={{ color: '#9FA3B5' }}>Snapshots</span>
      <span className="shrink-0 rounded-full bg-[#121215] px-2 py-0.5 font-medium tabular-nums" style={{ border: '1px solid #232329', color: '#7A7F93', fontSize: '11px' }}>
        {snapshots.length} saved
      </span>
      {snapshots.slice(0,3).map(s=>(
        <button key={s.id} onClick={()=>onRestore(s.body)} className="shrink-0 truncate border bg-[#0E0E10] px-2.5 py-1 font-mono text-xs tabular-nums transition-colors hover:border-[#2E2E36] hover:bg-[#16161A] hover:text-[#E6E8F0]" style={{borderColor: '#232329', color: '#7A7F93', maxWidth: '180px'}} title={new Date(s.createdAt).toLocaleString()}>
          {new Date(s.createdAt).toLocaleTimeString()} · {s.body.slice(0,28).replace(/\n/g,' ')}…
        </button>
      ))}
      {snapshots.length===0 && <span className="text-xs" style={{ color: '#5A5E6E' }}>auto-saved on each seed</span>}
    </div>
  );
}

  const handleBodyTypeChange = (next: RequestBodyType) => {
    const patch: Partial<RequestData> = { bodyType: next };
    if (next === 'json' || next === 'graphql' || next === 'xml') {
      const nextSize = getTabSizeForType(next);
      setTabSize(nextSize);
      const pretty = next === 'xml' ? formatXml(request.body, nextSize) : formatJson(request.body, nextSize);
      if (pretty && pretty !== request.body) patch.body = pretty;
    }
    onChange(patch);
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Toolbar — type + language pill + tab size + actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Body type — pill selector */}
        <div className="flex items-center gap-2">
          <select
            value={request.bodyType}
            onChange={(e) => handleBodyTypeChange(e.target.value as RequestBodyType)}
            className="h-8 border bg-[#0E0E10] px-3 pr-8 text-[13px] font-medium tracking-[-0.01em] text-[#E6E8F0] outline-none transition-all duration-200 hover:border-[#2E2E36] focus:border-[#8B5CF6]"
            style={{ borderColor: '#232329', borderRadius: '0px', boxShadow: 'none' }}
            onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)')}
            onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
            aria-label="Body type"
          >
            {BODY_TYPES.map((t) => (
              <option key={t} value={t} style={{ background: '#121215', color: '#E6E8F0' }}>
                {t}
              </option>
            ))}
          </select>

          <span
            className="hidden items-center gap-1.5 border bg-[#121215] px-2.5 py-1 font-mono text-xs tracking-[-0.01em] sm:inline-flex"
            style={{ borderColor: '#232329', color: '#9FA3B5' }}
            title="Editor language & tab size"
          >
            <Braces size={12} className="text-[#8B5CF6]" strokeWidth={2} /> {language} · {tabSize} spaces
          </span>

          <select
            value={tabSize}
            onChange={(e) => setTabSize(Number(e.target.value))}
            className="h-8 border bg-[#0E0E10] px-2 pr-6 text-xs font-medium tabular-nums text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6]"
            style={{ borderColor: '#232329', borderRadius: '0px' }}
            onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)')}
            onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
            aria-label="Tab size"
            title="Tab size (spaces)"
          >
            <option value={2} style={{ background: '#121215' }}>2 spaces</option>
            <option value={4} style={{ background: '#121215' }}>4 spaces</option>
          </select>
        </div>

        <div className="h-5 w-px shrink-0 bg-[#232329] hidden sm:block" aria-hidden />

        {request.bodyType !== 'none' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleFormat}
              disabled={!canFormat}
              title={canFormat ? `Format ${request.bodyType} (Shift+Alt+F)` : 'Nothing to format — valid JSON/XML required'}
              className="gap-1.5 bg-[#0E0E10] hover:bg-[#16161A] hover:border-[#2E2E36] disabled:opacity-40"
              style={{ borderColor: '#232329', height: '32px' }}
            >
              <Wand2 size={13} strokeWidth={1.9} /> Format
            </Button>
            <span className="hidden text-xs sm:inline" style={{ color: '#5A5E6E' }}>⇥ indents · ↵ keeps indent</span>

            <div className="h-5 w-px shrink-0 bg-[#232329]" aria-hidden />

            <Button
              variant="ghost"
              size="sm"
              onClick={seedBody}
              disabled={seeding || !request.body}
              className="gap-1.5 hover:bg-[rgba(139,92,246,0.10)] hover:text-[#8B5CF6] disabled:opacity-40"
              style={{ height: '32px' }}
            >
              <Dices size={13} strokeWidth={1.9} /> {seeding ? 'Seeding…' : 'Seed'}
            </Button>

            <select
              value={request.seedStrategy || 'overwrite'}
              onChange={(e) => onChange({ seedStrategy: e.target.value as never })}
              className="h-8 border bg-[#0E0E10] px-2 pr-6 text-xs text-[#E6E8F0] outline-none hover:border-[#2E2E36] focus:border-[#8B5CF6]"
              style={{ borderColor: '#232329', borderRadius: '0px' }}
            >
              <option value="overwrite" style={{ background: '#121215' }}>Overwrite</option>
              <option value="emptyOnly" style={{ background: '#121215' }}>Empty only</option>
            </select>

            <label className="flex items-center gap-1.5 text-xs" style={{ color: '#7A7F93' }}>
              <span className="tabular-nums">×</span>
              <input
                type="number"
                min={1}
                max={100}
                value={seedCount}
                onChange={(e) => setSeedCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                className="h-8 w-14 border bg-[#0E0E10] px-2 text-xs tabular-nums text-[#E6E8F0] outline-none hover:border-[#2E2E36] focus:border-[#8B5CF6]"
                style={{ borderColor: '#232329', borderRadius: '0px' }}
                onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)')}
                onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
              />
            </label>

            <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-xs" style={{ color: '#9FA3B5' }}>
              <input
                type="checkbox"
                checked={!!request.autoSeed}
                onChange={(e) => onChange({ autoSeed: e.target.checked })}
                className="h-3.5 w-3.5 accent-[#8B5CF6]"
              />
              Auto-seed
            </label>
          </div>
        )}
      </div>

      {request.bodyType !== 'none' ? (
        <>
          <div
            className="group relative flex flex-1 flex-col overflow-hidden border bg-[#0E0E10] transition-colors duration-200 hover:border-[#2E2E36] focus-within:border-[#8B5CF6]"
            style={{ borderColor: '#232329' }}
            onFocusCapture={(e) => {
              const target = e.currentTarget as HTMLDivElement;
              target.style.borderColor = '#8B5CF6';
              target.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)';
            }}
            onBlurCapture={(e) => {
              const target = e.currentTarget as HTMLDivElement;
              if (!target.contains(e.relatedTarget as Node)) {
                target.style.borderColor = '#232329';
                target.style.boxShadow = 'none';
              }
            }}
          >
            <CodeEditor
              value={request.body}
              onChange={(body) => onChange({ body })}
              language={language}
              tabSize={tabSize}
              onFormat={handleFormat}
              placeholder={
                request.bodyType === 'graphql'
                  ? '{\n  "query": "query { users { id name } }",\n  "variables": {}\n}'
                  : request.bodyType === 'json'
                    ? '{\n  "key": "value"\n}'
                    : request.bodyType === 'xml'
                      ? '<root>\n  <item>value</item>\n</root>'
                      : request.bodyType === 'form-data'
                        ? 'key: value  (multipart — seeded automatically)'
                        : 'Enter request body…'
              }
              className="flex-1 border-0 focus:border-0"
              onBlur={() => {
                if (request.bodyType === 'json' || request.bodyType === 'graphql') {
                  const pretty = formatJson(request.body, tabSize);
                  if (pretty && pretty !== request.body && pretty.split('\n').length > 1) {
                    onChange({ body: pretty });
                  }
                }
              }}
            />
            {/* Status bar */}
            <div
              className="flex items-center justify-between border-t bg-[#070709] px-3 py-1.5 text-xs"
              style={{ borderColor: '#232329', color: '#7A7F93' }}
            >
              <span className="font-mono text-xs tracking-[-0.01em] tabular-nums" style={{ color: '#9FA3B5' }}>
                <span className="font-semibold uppercase" style={{ color: '#E6E8F0', letterSpacing: '0.04em', fontSize: '11px' }}>
                  {request.bodyType}
                </span>
                <span className="mx-1.5" style={{ color: '#232329' }}>·</span>
                {language}
                <span className="mx-1.5" style={{ color: '#232329' }}>·</span>
                {request.body ? `${request.body.split('\n').length} lines, ${request.body.length.toLocaleString()} chars` : 'empty'}
              </span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <span
                  className="rounded-none border bg-[#121215] px-1.5 py-0.5 font-mono text-[11px] tabular-nums"
                  style={{ borderColor: '#232329', color: '#7A7F93' }}
                >
                  Tab {tabSize}␣
                </span>
                <span className="rounded-none border bg-[#121215] px-1.5 py-0.5 font-mono text-[11px]" style={{ borderColor: '#232329', color: '#7A7F93' }}>
                  ⇧ Tab dedent
                </span>
                <span
                  className="rounded-none border bg-[#121215] px-1.5 py-0.5 font-mono text-[11px]"
                  style={{ borderColor: '#232329', color: '#7A7F93' }}
                >
                  ⇧⌥F format
                </span>
              </span>
            </div>
          </div>
          <SeedSnapshots requestId={request.id} onRestore={(body)=>onChange({body})} />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed bg-[#0E0E10]/50 px-6 py-10 text-center" style={{ borderColor: '#232329' }}>
          <div className="flex h-9 w-9 items-center justify-center border bg-[#121215] text-[#7A7F93]" style={{ borderColor: '#232329' }}>
            <Info size={16} strokeWidth={1.7} />
          </div>
          <p className="text-sm font-medium tracking-[-0.01em]" style={{ color: '#E6E8F0' }}>No body</p>
          <p className="max-w-[320px] text-xs leading-relaxed" style={{ color: '#7A7F93' }}>
            This request has no body. Switch the type to <span className="font-medium text-[#E6E8F0]">JSON</span>, <span className="font-medium text-[#E6E8F0]">Form Data</span> or <span className="font-medium text-[#E6E8F0]">GraphQL</span> to add content.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {(['json','form-data','graphql'] as const).map(t=>(
              <button key={t} onClick={()=>handleBodyTypeChange(t)} className="border bg-[#121215] px-3 py-1.5 text-xs font-medium capitalize tracking-[-0.01em] text-[#9FA3B5] transition-colors hover:border-[#8B5CF6] hover:bg-[rgba(139,92,246,0.08)] hover:text-[#8B5CF6]" style={{borderColor:'#232329'}}>{t}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
