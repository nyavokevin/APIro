import { useState } from 'react';
import { Dices } from 'lucide-react';
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

export function BodyTab({ request, onChange }: BodyTabProps) {
  const [seeding, setSeeding] = useState(false);
  const [seedCount, setSeedCount] = useState(1);

  const seedBody = async () => {
    if (!request.body) return;
    setSeeding(true);
    try {
      // auto-seed with array count support via local generator
      const { generateBulkSeed } = await import('@main/services/seed-generator');
      const generated = generateBulkSeed(request.body, { strategy: request.seedStrategy || 'overwrite', count: seedCount });
      onChange({ body: generated });
      const { useNotificationStore } = await import('../../stores/notificationStore');
      useNotificationStore.getState().addToast({ variant:'success', title:'Seeded', description:`Generated ${seedCount>1?seedCount+' items':'bulk'} · strategy ${request.seedStrategy||'overwrite'}` });
      try { const { pushSeedSnapshot } = await import('../../lib/seedHistory'); pushSeedSnapshot(request.id, generated); } catch {}
    } finally {
      setSeeding(false);
    }
  };

function SeedSnapshots({ requestId, onRestore }:{ requestId:string; onRestore:(b:string)=>void }){
  const snapshots = (()=>{ try{ const { getSeedSnapshots } = require('../../lib/seedHistory'); return getSeedSnapshots(requestId) as import('../../lib/seedHistory').SeedSnapshot[]; }catch{ return [] as import('../../lib/seedHistory').SeedSnapshot[]; }})();
  return (
    <div className="mt-2 flex items-center gap-2 text-xs overflow-auto" style={{ borderTop:'1px solid #262626', paddingTop:'8px' }}>
      <span className="shrink-0 text-[#8F909E]">Snapshots (versionnés):</span>
      <span className="shrink-0 text-[#E2E8F0]">{snapshots.length} saved</span>
      {snapshots.slice(0,3).map(s=>(
        <button key={s.id} onClick={()=>onRestore(s.body)} className="shrink-0 px-2 py-0.5 bg-[#121212] text-[#8F909E] hover:text-[#E2E8F0] truncate max-w-[150px]" style={{border:'1px solid #262626', borderRadius:'0px'}} title={new Date(s.createdAt).toLocaleString()}>
          {new Date(s.createdAt).toLocaleTimeString()} · {s.body.slice(0,22).replace(/\n/g,' ')}…
        </button>
      ))}
      {snapshots.length===0 && <span className="text-[#8F909E]">— auto-saved on each seed</span>}
    </div>
  );
}

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex items-center gap-2">
        <select
          value={request.bodyType}
          onChange={(e) => onChange({ bodyType: e.target.value as RequestBodyType })}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
          aria-label="Body type"
        >
          {BODY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {request.bodyType !== 'none' && (
          <>
            <Button variant="ghost" onClick={seedBody} disabled={seeding}>
              <Dices size={14} /> {seeding ? 'Seeding…' : 'Seed'}
            </Button>
            <select value={request.seedStrategy||'overwrite'} onChange={e=>onChange({seedStrategy:e.target.value as never})} className="bg-[#121212] text-[#E2E8F0] px-2 py-1 text-xs" style={{border:'1px solid #262626', borderRadius:'0px'}}>
              <option value="overwrite">Overwrite</option>
              <option value="emptyOnly">Empty only</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-[#8F909E]">×<input type="number" min={1} max={100} value={seedCount} onChange={e=>setSeedCount(Math.max(1, Math.min(100, parseInt(e.target.value)||1)))} className="w-14 bg-[#121212] px-1 py-1 text-xs text-[#E2E8F0]" style={{border:'1px solid #262626', borderRadius:'0px'}}/></label>
            <label className="ml-2 flex items-center gap-1 text-xs text-[#8F909E]"><input type="checkbox" checked={!!request.autoSeed} onChange={e=>onChange({autoSeed:e.target.checked})} /> Auto-seed before send</label>
          </>
        )}
      </div>
      {request.bodyType !== 'none' ? (
        <>
          <CodeEditor
            value={request.body}
            onChange={(body) => onChange({ body })}
            placeholder={
              request.bodyType === 'graphql'
                ? '{ "query": "" }'
                : request.bodyType === 'json'
                  ? '{ }'
                  : ''
            }
            className="flex-1"
          />
          <SeedSnapshots requestId={request.id} onRestore={(body)=>onChange({body})} />
        </>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">This request has no body.</p>
      )}
    </div>
  );
}
