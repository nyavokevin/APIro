import { useEffect, useState, useRef } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, Square, Download, FlaskConical, Timer, Layers, AlertTriangle } from 'lucide-react';
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
  return `<!doctype html><html><head><meta charset="utf-8"><title>${collectionName} — Test Report</title><style>body{font-family:Inter,system-ui;background:#070709;color:#E6E8F0;margin:0;padding:32px}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #232329;padding:8px 12px;text-align:left;font-size:13px}th{background:#121215;color:#9FA3B5;text-transform:uppercase;font-size:11px}td{color:#E6E8F0}.ok{color:#10B981}.err{color:#EF4444}.meta{color:#7A7F93;font-size:12px}</style></head><body><h1>${collectionName}</h1><p class="meta">${rows.length} requests · ${passed} passed · ${failed} failed · ${pt} tests passed · ${ft} failed</p><table><thead><tr><th>Status</th><th>Method</th><th>Name</th><th>Time</th><th>Tests</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="${r.ok?'ok':'err'}">${r.error?`ERR`:r.status}</td><td>${r.method}</td><td>${r.name}</td><td>${r.durationMs||0}ms</td><td>${r.tests.length?`${r.tests.filter(t=>t.passed).length}/${r.tests.length}`:'—'}</td></tr>`).join('')}</tbody></table></body></html>`;
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

  const activeRows: RunRow[] = (activeRun && activeRun.collectionId===selectedId ? activeRun.rows as RunRow[] : []);
  const progress = activeRun && activeRun.collectionId===selectedId ? activeRun.progress : 0;
  const running = isRunning && activeRun?.collectionId===selectedId && activeRun?.status==='running';

  const abortRef = useRef<AbortController|null>(null);

  useEffect(()=>{
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

    let accumulatedVars = [...useWorkspaceStore.getState().variables()];
    const chainUpdates: Record<string,string> = {};

    const executeOne = async (req: RequestData, idx: number): Promise<void> => {
      if (controller.signal.aborted) { cancelled = true; return; }
      const row: RunRow = { id: req.id, name: req.name, method: req.method, url: req.url, status: null, ok: false, tests: [] };
      try {
        const start = performance.now();
        let effectiveReq = req;
        let varsForThis = accumulatedVars;
        if (req.preRequestScript && req.preRequestScript.trim()) {
          const pre = runPreRequestBrowser(req.preRequestScript, req, accumulatedVars);
          effectiveReq = pre.request;
          varsForThis = pre.variables;
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
        let tests: TestResult[] = res.testResults ?? [];
        if (req.testScript && req.testScript.trim()) {
          tests = runTestsBrowser(effectiveReq, res, req.testScript, varsForThis);
        }
        row.tests = tests;
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
      if (mode==='sequential' && Object.keys(chainUpdates).length>0) {
        const ws = useWorkspaceStore.getState();
        const env = ws.environments.find(e=>e.id===ws.activeEnvironmentId);
        if (env) {
          const vars = [...env.variables];
          for (const [k,v] of Object.entries(chainUpdates)) {
            const idx = vars.findIndex(x=>x.key===k);
            if (idx>=0) vars[idx] = { ...vars[idx], value: v };
            else vars.push({ id:k, key:k, value:v, type:'string', enabled:true } as never);
          }
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
    <div className="flex h-full flex-col overflow-hidden bg-[#070709]">
      <div className="flex items-center gap-3 shrink-0 px-5 py-3.5" style={{ background: '#070709', borderBottom: '1px solid #232329' }}>
        <span className="flex h-8 w-8 items-center justify-center bg-[rgba(139,92,246,0.12)] text-[#8B5CF6]" style={{ border: '1px solid rgba(139,92,246,0.22)' }}>
          <FlaskConical size={16} strokeWidth={1.8} />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-[#E6E8F0]" style={{ letterSpacing: '-0.01em' }}>Collection Runner</h2>
        {isRunning && activeRun && (
          <span className="ml-2 hidden items-center gap-2 font-mono text-xs tabular-nums text-[#7A7F93] sm:inline-flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#8B5CF6] shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
            Running {activeRun.collectionName} in background…
          </span>
        )}
        <span className="ml-auto hidden items-center gap-1.5 font-mono text-xs tabular-nums text-[#7A7F93] sm:inline-flex">
          <Layers size={12} /> {collections.length} collections
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-[#0E0E10] p-4 shrink-0" style={{ borderBottom: '1px solid #232329' }}>
        <label className="block min-w-[220px] flex-1 max-w-[320px]">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-[#9FA3B5]" style={{ letterSpacing: '0.02em' }}>Collection</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-[#121215] px-3 py-2 text-sm font-medium text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.12)]"
            style={{ border: '1px solid #232329', height: '38px' }}
          >
            <option value="">Select a collection…</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-[#9FA3B5]" style={{ letterSpacing: '0.02em' }}>Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'sequential' | 'parallel')}
            className="bg-[#121215] px-3 py-2 text-sm font-medium text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.12)]"
            style={{ border: '1px solid #232329', height: '38px', minWidth: '140px' }}
          >
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
          </select>
        </label>

        {mode === 'parallel' && (
          <label className="block animate-fadeUp">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-[#9FA3B5]" style={{ letterSpacing: '0.02em' }}>Concurrency</span>
            <input
              type="number"
              min={1} max={20} value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-24 bg-[#121215] px-3 py-2 text-sm font-medium tabular-nums text-[#E6E8F0] outline-none transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:ring-2 focus:ring-[rgba(139,92,246,0.12)]"
              style={{ border: '1px solid #232329', height: '38px' }}
            />
          </label>
        )}

        <div className="flex items-center gap-2">
          {!running ? (
            <Button
              variant="primary"
              onClick={run}
              disabled={!collection || requests.length === 0}
              className="hover:-translate-y-[1px] hover:shadow-[0_6px_16px_rgba(139,92,246,0.3)] active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              style={{ height: '38px', paddingLeft: '18px', paddingRight: '18px' }}
            >
              <Play size={14} strokeWidth={2} /> Run {requests.length} request{requests.length !== 1 ? 's' : ''}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={cancel}
              className="hover:-translate-y-[1px] active:translate-y-0"
              style={{ height: '38px', borderColor: '#EF4444', color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}
            >
              <Square size={14} className="fill-current" /> Cancel
            </Button>
          )}
        </div>
        {activeRows.length>0 && !running && (
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportJUnit} className="hover:-translate-y-[1px] hover:border-[#2E2E36] active:translate-y-0">
              <Download size={14}/> JUnit
            </Button>
            <Button variant="secondary" size="sm" onClick={exportHTML} className="hover:-translate-y-[1px] hover:border-[#2E2E36] active:translate-y-0">
              <Download size={14}/> HTML
            </Button>
          </div>
        )}
      </div>

      {collection && requests.length === 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-[#121215] px-3 py-2.5 text-xs text-[#7A7F93] animate-fadeUp" style={{ border: '1px solid #232329', borderLeft: '2px solid #F59E0B' }}>
          <AlertTriangle size={14} className="shrink-0 text-[#F59E0B]" />
          This collection has no requests. Add requests under it first.
        </div>
      )}

      {running && (
        <div className="px-4 py-3 shrink-0 animate-fadeUp" style={{ background: '#121215', borderBottom: '1px solid #232329' }}>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden bg-[#070709]" style={{ border: '1px solid #232329' }}>
              <div
                className="h-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                  width: `${(progress / Math.max(1, requests.length)) * 100}%`,
                  background: '#8B5CF6',
                  boxShadow: '0 0 12px rgba(139,92,246,0.45)',
                }}
              />
            </div>
            <span className="font-mono text-xs font-semibold tabular-nums text-[#8B5CF6]">{Math.round((progress / Math.max(1, requests.length)) * 100)}%</span>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-xs tabular-nums text-[#7A7F93]">
            <Timer size={11} /> {progress} / {requests.length} — don’t block UI, you can switch tabs.
            <button onClick={cancel} className="ml-2 font-medium text-[#EF4444] underline decoration-[rgba(239,68,68,0.30)] underline-offset-2 hover:text-[#DC2626]">Cancel</button>
          </p>
        </div>
      )}

      {activeRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs shrink-0" style={{ background: '#0E0E10', borderBottom: '1px solid #232329' }}>
          <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-[#7A7F93]">
            <Layers size={12} /> {activeRows.length} requests
          </span>
          <span className="h-3 w-px bg-[#232329]" />
          <span className="inline-flex items-center gap-1.5 px-2 py-1 font-semibold tabular-nums text-[#10B981]" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.20)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" /> {activeRows.filter((r) => r.ok).length} passed
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 font-semibold tabular-nums text-[#EF4444]" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.18)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" /> {activeRows.filter((r) => !r.ok).length} failed
          </span>
          <span className="hidden h-3 w-px bg-[#232329] sm:block" />
          <span className="font-mono tabular-nums text-[#7A7F93]">{passedTests} tests passed / {failedTests} failed</span>
          {activeRun?.status==='cancelled' && <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-[#F59E0B]" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.22)' }}>Cancelled</span>}
        </div>
      )}

      {runs.length>0 && (
        <div className="flex gap-2 overflow-auto px-4 py-2.5 shrink-0" style={{ background: '#121215', borderBottom: '1px solid #232329' }}>
          {runs.slice(0,5).map(r=>(
            <button
              key={r.id}
              onClick={()=>useTestingStore.setState({activeRunId:r.id})}
              className="shrink-0 px-3 py-1.5 text-xs font-medium tabular-nums transition-all hover:-translate-y-[1px] hover:border-[#2E2E36] active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.45)]"
              style={{
                border: `1px solid ${r.id===activeRunId?'#8B5CF6':'#232329'}`,
                background: r.id===activeRunId?'rgba(139,92,246,0.12)':'#070709',
                color: r.status==='running'?'#F59E0B':r.status==='cancelled'?'#7A7F93':r.status==='done'?'#10B981':'#E6E8F0',
                boxShadow: r.id===activeRunId ? '0 0 0 3px rgba(139,92,246,0.10)' : 'none',
              }}
            >
              {r.collectionName} · {r.status} · {r.progress}/{r.total}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 bg-[#070709]">
        {activeRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center animate-fadeUp">
            <div className="flex h-12 w-12 items-center justify-center bg-[#121215] text-[#7A7F93]" style={{ border: '1px solid #232329' }}>
              <FlaskConical size={20} strokeWidth={1.5} />
            </div>
            <p className="text-sm font-semibold tracking-tight text-[#E6E8F0]">No runs yet</p>
            <p className="max-w-[42ch] text-xs leading-relaxed text-[#7A7F93]">Select a collection and hit Run. Execution continues in background — you can navigate away. Progress and results appear here.</p>
          </div>
        ) : (
          <div className="overflow-hidden bg-[#121215]" style={{ border: '1px solid #232329' }}>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-widest text-[#7A7F93]" style={{ background: '#0E0E10', borderBottom: '1px solid #232329', letterSpacing: '0.07em' }}>
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Status</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Method</th>
                    <th className="px-3 py-2.5 font-semibold">Name</th>
                    <th className="px-3 py-2.5 font-semibold">URL</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums">Time</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold">Tests</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E1E24]">
                  {activeRows.map((r, i) => {
                    const passed = r.tests.filter((t) => t.passed).length;
                    const total = r.tests.length;
                    const hasFlaky = r.tests.some(t=>flakySet.has(`${r.name}::${t.name}`));
                    return (
                      <tr
                        key={`${r.id}-${i}`}
                        className="group transition-colors hover:bg-[#16161A] animate-fadeUp"
                        style={{ animationDelay: `${i * 14}ms`, borderLeft: `2px solid ${r.error ? '#EF4444' : r.ok ? '#10B981' : '#232329'}` }}
                      >
                        <td className="px-3 py-2.5">
                          {r.error ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.22)' }}>
                              <XCircle size={12} /> ERR
                            </span>
                          ) : r.ok ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold tabular-nums" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.22)' }}>
                              <CheckCircle2 size={12} /> {r.status}
                            </span>
                          ) : r.status===null ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#7A7F93]" style={{ background: '#070709', border: '1px solid #232329' }}>
                              <Loader2 size={12} className="animate-spin" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold tabular-nums" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.22)' }}>
                              <XCircle size={12} /> {r.status}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold" style={{ color: METHOD_COLORS[r.method as keyof typeof METHOD_COLORS] ?? '#7A7F93' }}>{r.method}</td>
                        <td className="px-3 py-2.5 text-[#E6E8F0]">
                          <span className="line-clamp-1 font-medium">{r.name || '—'}</span>
                        </td>
                        <td className="max-w-[280px] px-3 py-2.5">
                          <div className="truncate font-mono text-xs tabular-nums text-[#7A7F93]" title={r.url}>{r.url}</div>
                          {r.error && <span className="mt-1 block break-all rounded bg-[#070709] px-1.5 py-1 font-mono text-xs text-[#EF4444]" style={{ border: '1px solid rgba(239,68,68,0.16)' }}>{r.error}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs tabular-nums text-[#7A7F93]">{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {total > 0 ? (
                              <span className={`inline-flex items-center px-2 py-1 font-mono text-xs font-semibold tabular-nums ${passed===total ? 'text-[#10B981]' : passed===0 ? 'text-[#EF4444]' : 'text-[#F59E0B]'}`} style={{ background: passed===total ? 'rgba(16,185,129,0.12)' : passed===0 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${passed===total ? 'rgba(16,185,129,0.22)' : passed===0 ? 'rgba(239,68,68,0.22)' : 'rgba(245,158,11,0.22)'}` }}>
                                {passed}/{total}
                              </span>
                            ) : (
                              <span className="font-mono text-xs tabular-nums text-[#7A7F93]">—</span>
                            )}
                            {hasFlaky && <span className="inline-flex items-center gap-1 px-1.5 py-1 text-xs font-semibold" style={{background:'rgba(245,158,11,0.14)', color:'#F59E0B', border:'1px solid rgba(245,158,11,0.30)'}}><AlertTriangle size={10}/> Flaky</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
