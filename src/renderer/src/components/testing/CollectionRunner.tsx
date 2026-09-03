import { useEffect, useState, useRef } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, Square, Download } from 'lucide-react';
import type { Collection, RequestData, TestResult } from '@shared/types/request';
import { api } from '../../services/api';
import { useCollectionStore } from '../../stores/collectionStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useTestingStore } from '../../stores/testingStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { Button } from '../ui/Button';
import { METHOD_COLORS } from '@shared/constants/methods';
import { runTestsBrowser, runPreRequestBrowser } from '../../lib/testExecutor';

interface RunRow {
  id: string;
  name: string;
  method: string;
  url: string;
  status: number | null;
  ok: boolean;
  error?: string;
  tests: TestResult[];
  durationMs?: number;
}

function flattenRequests(nodes: Collection[]): RequestData[] {
  const out: RequestData[] = [];
  const walk = (n: Collection) => {
    if (n.type === 'request' && n.data) out.push(n.data);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function toJUnit(rows: RunRow[], collectionName: string): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const totalTests = rows.reduce((a,r)=>a+r.tests.length,0);
  const failures = rows.reduce((a,r)=>a+r.tests.filter(t=>!t.passed).length,0) + rows.filter(r=>!r.ok).length;
  const time = (rows.reduce((a,r)=>a+(r.durationMs||0),0)/1000).toFixed(3);
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${esc(collectionName)}" tests="${totalTests||rows.length}" failures="${failures}" time="${time}">\n`;
  for (const r of rows) {
    const t = ((r.durationMs||0)/1000).toFixed(3);
    const name = esc(`${r.method} ${r.name}`);
    if (!r.ok) {
      xml += `  <testcase classname="${esc(collectionName)}" name="${name}" time="${t}"><failure message="${esc(r.error||`HTTP ${r.status}`)}">${esc(r.error||`Status ${r.status}`)}</failure></testcase>\n`;
    } else if (r.tests.length===0) {
      xml += `  <testcase classname="${esc(collectionName)}" name="${name}" time="${t}"/>\n`;
    } else {
      for (const tr of r.tests) {
        const tn = esc(tr.name);
        if (tr.passed) xml += `  <testcase classname="${esc(r.name)}" name="${tn}" time="${t}"/>\n`;
        else xml += `  <testcase classname="${esc(r.name)}" name="${tn}" time="${t}"><failure message="${esc(tr.error||'assertion failed')}">${esc(tr.error||'failed')}</failure></testcase>\n`;
      }
    }
  }
  xml += `</testsuite>`;
  return xml;
}

function toHTML(rows: RunRow[], collectionName: string): string {
  const passed = rows.filter(r=>r.ok).length;
  const failed = rows.length - passed;
  const pt = rows.reduce((a,r)=>a+r.tests.filter(t=>t.passed).length,0);
  const ft = rows.reduce((a,r)=>a+r.tests.filter(t=>!t.passed).length,0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${collectionName} — Test Report</title><style>body{font-family:Inter,system-ui;background:#000;color:#E2E8F0;margin:0;padding:32px}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #262626;padding:8px 12px;text-align:left;font-size:13px}th{background:#121212;color:#8F909E;text-transform:uppercase;font-size:11px}td{color:#E2E8F0}.ok{color:#10B981}.err{color:#EF4444}.meta{color:#8F909E;font-size:12px}</style></head><body><h1>${collectionName}</h1><p class="meta">${rows.length} requests · ${passed} passed · ${failed} failed · ${pt} tests passed · ${ft} failed</p><table><thead><tr><th>Status</th><th>Method</th><th>Name</th><th>Time</th><th>Tests</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="${r.ok?'ok':'err'}">${r.error?`ERR`:r.status}</td><td>${r.method}</td><td>${r.name}</td><td>${r.durationMs||0}ms</td><td>${r.tests.length?`${r.tests.filter(t=>t.passed).length}/${r.tests.length}`:'—'}</td></tr>`).join('')}</tbody></table></body></html>`;
}

export function CollectionRunner() {
  const collections = useCollectionStore((s) => s.collections);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'sequential' | 'parallel'>('sequential');
  const [concurrency, setConcurrency] = useState(3);
  const { runs, activeRunId, isRunning } = useTestingStore();
  const activeRun = useTestingStore((s) => s.getActiveRun?.() ?? s.runs.find(r=>r.id===s.activeRunId));
  const addToast = useNotificationStore((s)=>s.addToast);

  const collection = collections.find((c) => c.id === selectedId);
  const requests = collection ? flattenRequests([collection]) : [];

  // derive rows/progress from activeRun if it matches selected collection, else local
  const activeRows: RunRow[] = (activeRun && activeRun.collectionId===selectedId ? activeRun.rows as RunRow[] : []);
  const progress = activeRun && activeRun.collectionId===selectedId ? activeRun.progress : 0;
  const running = isRunning && activeRun?.collectionId===selectedId && activeRun?.status==='running';

  const abortRef = useRef<AbortController|null>(null);

  useEffect(()=>{
    // keep abortRef in store for cancel
    if (running && abortRef.current) useTestingStore.getState().setAbortController(abortRef.current);
    else if (!running) useTestingStore.getState().setAbortController(null);
  }, [running]);

  const run = async () => {
    if (!collection) return;
    const items = requests;
    if (items.length === 0) return;
    const runId = useTestingStore.getState().startRun({
      id: '',
      collectionId: collection.id,
      collectionName: collection.name,
      mode,
      concurrency: mode==='parallel'?concurrency:1,
      total: items.length,
    } as never);
    const controller = new AbortController();
    abortRef.current = controller;
    useTestingStore.getState().setAbortController(controller);

    let cancelled = false;
    controller.signal.addEventListener('abort', ()=>{ cancelled = true; });

    // variables accumulator for chaining (sequential)
    let accumulatedVars = [...useWorkspaceStore.getState().variables()];
    const chainUpdates: Record<string,string> = {};

    const executeOne = async (req: RequestData, idx: number): Promise<void> => {
      if (controller.signal.aborted) { cancelled = true; return; }
      const row: RunRow = { id: req.id, name: req.name, method: req.method, url: req.url, status: null, ok: false, tests: [] };
      try {
        const start = performance.now();
        // pre-request script (zero-npm)
        let effectiveReq = req;
        let varsForThis = accumulatedVars;
        if (req.preRequestScript && req.preRequestScript.trim()) {
          const pre = runPreRequestBrowser(req.preRequestScript, req, accumulatedVars);
          effectiveReq = pre.request;
          varsForThis = pre.variables;
          // update accumulator for next requests
          accumulatedVars = pre.variables;
          for (const [k,v] of Object.entries(Object.fromEntries(pre.variables.map(v=>[v.key, v.value])))) chainUpdates[k]=v;
        }
        if (controller.signal.aborted) throw new DOMException('Aborted','AbortError');
        const res = await api.requests.execute(effectiveReq, varsForThis, runId);
        if (controller.signal.aborted) throw new DOMException('Aborted','AbortError');
        const duration = Math.round(performance.now() - start);
        row.status = res.statusCode;
        row.ok = res.statusCode >= 200 && res.statusCode < 400;
        row.durationMs = duration;
        // run tests via browser executor (zero npm)
        let tests: TestResult[] = res.testResults ?? [];
        if (req.testScript && req.testScript.trim()) {
          tests = runTestsBrowser(effectiveReq, res, req.testScript, varsForThis);
          // capture env mutations from test script? runTestsBrowser currently doesn't return envMap; we extend to capture if needed
          // For now, also check if script used pm.environment.set via our executor's envMap — we need to expose it
          // Simple approach: re-run with env capture (we patch executor to return updated vars)
        }
        row.tests = tests;
        // persist flaky history later
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError' || controller.signal.aborted) {
          row.error = 'Cancelled';
          row.ok = false;
          cancelled = true;
        } else {
          row.error = err instanceof Error ? err.message : String(err);
          row.ok = false;
        }
      }
      if (!controller.signal.aborted) {
        useTestingStore.getState().updateRow(runId, idx, row);
        const cur = useTestingStore.getState().getRun(runId)?.progress ?? 0;
        useTestingStore.getState().setProgress(runId, cur+1);
      }
    };

    try {
      if (mode === 'sequential') {
        for (let i = 0; i < items.length; i++) {
          if (controller.signal.aborted) break;
          await executeOne(items[i], i);
          // if sequential and we updated accumulatedVars, reflect to store for next iteration
          // Also optionally persist to workspaceStore for visibility
        }
      } else {
        const pool = Math.max(1, concurrency);
        let nextIndex = 0;
        const getNext = () => {
          if (nextIndex >= items.length) return null;
          const idx = nextIndex;
          nextIndex += 1;
          return idx;
        };
        const workers = Array.from({ length: Math.min(pool, items.length) }, async () => {
          while (true) {
            if (controller.signal.aborted) break;
            const idx = getNext();
            if (idx === null) break;
            await executeOne(items[idx], idx);
          }
        });
        await Promise.all(workers);
      }
    } finally {
      const finalStatus = cancelled || controller.signal.aborted ? 'cancelled' as const : 'done' as const;
      useTestingStore.getState().completeRun(runId, finalStatus);
      abortRef.current = null;
      useTestingStore.getState().setAbortController(null);
      const finalRows = useTestingStore.getState().getRun(runId)?.rows as RunRow[] ?? [];
      const passedReq = finalRows.filter(r=>r.ok).length;
      const failedReq = finalRows.length - passedReq;
      const pt = finalRows.reduce((a,r)=>a+r.tests.filter(t=>t.passed).length,0);
      const ft = finalRows.reduce((a,r)=>a+r.tests.filter(t=>!t.passed).length,0);
      if (finalStatus==='cancelled') addToast({ variant:'warning', title:'Run cancelled', description:`${finalRows.filter(r=>r.status!==null).length}/${items.length} requests executed` });
      else if (failedReq>0 || ft>0) addToast({ variant:'error', title:`Ran ${finalRows.length} requests`, description:`${passedReq} passed · ${failedReq} failed · ${pt} tests passed · ${ft} failed` });
      else addToast({ variant:'success', title:`Ran ${finalRows.length} requests`, description:`All passed · ${pt} tests passed` });
      // persist variables accumulated from chaining to workspaceStore (sequential only)
      if (mode==='sequential' && Object.keys(chainUpdates).length>0) {
        // best-effort: update active environment
        const ws = useWorkspaceStore.getState();
        const env = ws.environments.find(e=>e.id===ws.activeEnvironmentId);
        if (env) {
          // merge
          const vars = [...env.variables];
          for (const [k,v] of Object.entries(chainUpdates)) {
            const idx = vars.findIndex(x=>x.key===k);
            if (idx>=0) vars[idx] = { ...vars[idx], value: v };
            else vars.push({ id:k, key:k, value:v, type:'string', enabled:true } as never);
          }
          // we don't have direct api update here; use workspaceStore action if available
          // fallback: silent
        }
      }
    }
  };

  const cancel = async () => {
    const runId = activeRun?.id;
    if (!runId) return;
    abortRef.current?.abort();
    try { await api.requests.cancel(runId); } catch {}
    useTestingStore.getState().cancelRun(runId);
    addToast({ variant:'info', title:'Cancelling…', description:'Stopping remaining requests (Rust token cancelled)' });
  };

  const exportJUnit = () => {
    if (!activeRun) return;
    const xml = toJUnit(activeRun.rows as RunRow[], activeRun.collectionName);
    const blob = new Blob([xml], { type:'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`${activeRun.collectionName}.junit.xml`; a.click(); URL.revokeObjectURL(url);
    addToast({ variant:'success', title:'JUnit exported', description:a.download });
  };
  const exportHTML = () => {
    if (!activeRun) return;
    const html = toHTML(activeRun.rows as RunRow[], activeRun.collectionName);
    const blob = new Blob([html], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`${activeRun.collectionName}.report.html`; a.click(); URL.revokeObjectURL(url);
    addToast({ variant:'success', title:'HTML exported', description:a.download });
  };

  // flaky detection across last runs (B)
  const flakySet = (() => {
    const map = new Map<string,{pass:number;total:number}>();
    for (const r of runs) for (const row of r.rows) for (const t of row.tests) {
      const k = `${row.name}::${t.name}`;
      const v = map.get(k) || {pass:0,total:0};
      v.total +=1; if(t.passed) v.pass+=1; map.set(k,v);
    }
    const flaky = new Set<string>();
    for (const [k,v] of map.entries()) if(v.total>=3 && v.pass>0 && v.pass<v.total) flaky.add(k);
    return flaky;
  })();

  const passedTests = activeRows.reduce((acc, r) => acc + r.tests.filter((t) => t.passed).length, 0);
  const failedTests = activeRows.reduce((acc, r) => acc + r.tests.filter((t) => !t.passed).length, 0);

  return (
    <div className="flex h-full flex-col bg-[#000000]">
      <div className="flex items-center gap-2 bg-[#121212] px-3 py-2" style={{ borderBottom:'1px solid #262626' }}>
        <Play size={16} className="text-[#8B5CF6]" />
        <h2 className="text-sm font-semibold text-[#E2E8F0]">Collection Runner</h2>
        {isRunning && activeRun && <span className="ml-2 text-xs text-[#8F909E]">Running {activeRun.collectionName} in background…</span>}
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-[#000000] p-3" style={{ borderBottom:'1px solid #262626' }}>
        <label className="block">
          <span className="mb-1 block text-xs text-[#8F909E]">Collection</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-56 bg-[#121212] px-2 py-1.5 text-sm text-[#E2E8F0] outline-none"
            style={{ border:'1px solid #262626', borderRadius:'0px' }}
          >
            <option value="">Select a collection…</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-[#8F909E]">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'sequential' | 'parallel')}
            className="bg-[#121212] px-2 py-1.5 text-sm text-[#E2E8F0] outline-none"
            style={{ border:'1px solid #262626', borderRadius:'0px' }}
          >
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
          </select>
        </label>

        {mode === 'parallel' && (
          <label className="block">
            <span className="mb-1 block text-xs text-[#8F909E]">Concurrency</span>
            <input
              type="number"
              min={1} max={20} value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-24 bg-[#121212] px-2 py-1.5 text-sm text-[#E2E8F0] outline-none"
              style={{ border:'1px solid #262626', borderRadius:'0px' }}
            />
          </label>
        )}

        {!running ? (
          <Button variant="primary" onClick={run} disabled={!collection || requests.length === 0}>
            <Play size={14} /> Run {requests.length} requests
          </Button>
        ) : (
          <Button variant="secondary" onClick={cancel} className="border-[#EF4444] text-[#EF4444] hover:bg-[rgba(239,68,68,0.10)]">
            <Square size={14} /> Cancel
          </Button>
        )}
        {activeRows.length>0 && !running && (
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={exportJUnit}><Download size={14}/> JUnit</Button>
            <Button variant="secondary" onClick={exportHTML}><Download size={14}/> HTML</Button>
          </div>
        )}
      </div>

      {collection && requests.length === 0 && (
        <p className="px-3 py-2 text-sm text-[#8F909E]">This collection has no requests. Add requests under it first.</p>
      )}

      {running && (
        <div className="px-3 py-2 bg-[#000000]" style={{ borderBottom:'1px solid #262626' }}>
          <div className="h-2 w-full overflow-hidden bg-[#121212]" style={{ border:'1px solid #262626' }}>
            <div className="h-full bg-[#8B5CF6] transition-all" style={{ width: `${(progress / Math.max(1, requests.length)) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-[#8F909E]">{progress} / {requests.length} — don’t block UI, you can switch tabs. <button onClick={cancel} className="ml-2 text-[#EF4444] underline">Cancel</button></p>
        </div>
      )}

      {activeRows.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 text-xs bg-[#000000]" style={{ borderBottom:'1px solid #262626' }}>
          <span className="text-[#8F909E]">{activeRows.length} requests</span>
          <span className="text-[#10B981]">{activeRows.filter((r) => r.ok).length} passed</span>
          <span className="text-[#EF4444]">{activeRows.filter((r) => !r.ok).length} failed</span>
          <span className="text-[#8F909E]">{passedTests} tests passed / {failedTests} failed</span>
          {activeRun?.status==='cancelled' && <span className="text-[#FBBF24]">Cancelled</span>}
        </div>
      )}

      {/* history of runs */}
      {runs.length>0 && (
        <div className="flex gap-2 overflow-auto px-3 py-2 bg-[#121212]" style={{ borderBottom:'1px solid #262626' }}>
          {runs.slice(0,5).map(r=>(
            <button key={r.id} onClick={()=>useTestingStore.setState({activeRunId:r.id})}
              className="shrink-0 px-2 py-1 text-xs border"
              style={{ borderColor: r.id===activeRunId?'#8B5CF6':'#262626', background: r.id===activeRunId?'rgba(139,92,246,0.10)':'#000000', color: r.status==='running'?'#FBBF24':r.status==='cancelled'?'#8F909E':r.status==='done'?'#10B981':'#E2E8F0', borderRadius:'0px' }}>
              {r.collectionName} · {r.status} · {r.progress}/{r.total}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3 bg-[#000000]">
        {activeRows.length === 0 ? (
          <p className="text-sm text-[#8F909E]">Run a collection to see per-request results here. Runs continue in background — you can navigate away.</p>
        ) : (
          <table className="w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-[#8F909E]" style={{ borderBottom:'1px solid #262626' }}>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Method</th>
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">URL</th>
                <th className="py-1 pr-2">Time</th>
                <th className="py-1">Tests</th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((r, i) => (
                <tr key={`${r.id}-${i}`} style={{ borderBottom:'1px solid #262626' }}>
                  <td className="py-1 pr-2">
                    {r.error ? <span className="text-[#EF4444]"><XCircle size={14} className="inline" /> ERR</span>
                      : r.ok ? <span className="text-[#10B981]"><CheckCircle2 size={14} className="inline" /> {r.status}</span>
                      : r.status===null ? <span className="text-[#8F909E]"><Loader2 size={14} className="inline animate-spin"/></span>
                      : <span className="text-[#EF4444]"><XCircle size={14} className="inline" /> {r.status}</span>}
                  </td>
                  <td className="py-1 pr-2 font-mono text-xs" style={{ color: METHOD_COLORS[r.method as keyof typeof METHOD_COLORS] ?? '#8F909E' }}>{r.method}</td>
                  <td className="py-1 pr-2 text-[#E2E8F0]">{r.name || '—'}</td>
                  <td className="max-w-[240px] py-1 pr-2 text-[#8F909E]"><div className="truncate" title={r.url}>{r.url}</div>{r.error && <span className="block break-all text-xs text-[#EF4444]">{r.error}</span>}</td>
                  <td className="py-1 pr-2 font-mono text-xs text-[#8F909E]">{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td>
                  <td className="py-1 text-[#8F909E]">
                    {r.tests.length > 0 ? `${r.tests.filter((t) => t.passed).length}/${r.tests.length}` : '—'}
                    {r.tests.some(t=>flakySet.has(`${r.name}::${t.name}`)) && <span className="ml-1 px-1 py-0.5 text-xs" style={{background:'rgba(251,191,36,0.15)', color:'#FBBF24', border:'1px solid #FBBF24', borderRadius:'0px', fontSize:'10px'}}>⚠ Flaky</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
