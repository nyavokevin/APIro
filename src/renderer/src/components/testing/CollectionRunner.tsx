import { useState } from 'react';
import { Play, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { Collection, RequestData, TestResult } from '@shared/types/request';
import { api } from '../../services/api';
import { useCollectionStore } from '../../stores/collectionStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { Button } from '../ui/Button';
import { METHOD_COLORS } from '@shared/constants/methods';

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

export function CollectionRunner() {
  const collections = useCollectionStore((s) => s.collections);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<'sequential' | 'parallel'>('sequential');
  const [concurrency, setConcurrency] = useState(3);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<RunRow[]>([]);

  const collection = collections.find((c) => c.id === selectedId);
  const requests = collection ? flattenRequests([collection]) : [];

  const run = async () => {
    if (!collection) return;
    const items = requests;
    if (items.length === 0) return;
    setRunning(true);
    setProgress(0);
    setRows([]);
    const results: RunRow[] = [];

    const executeOne = async (req: RequestData, idx: number): Promise<void> => {
      const row: RunRow = {
        id: req.id,
        name: req.name,
        method: req.method,
        url: req.url,
        status: null,
        ok: false,
        tests: [],
      };
      try {
        const start = performance.now();
        const vars = useWorkspaceStore.getState().variables();
        const res = await api.requests.execute(req, vars);
        const duration = Math.round(performance.now() - start);
        row.status = res.statusCode;
        row.ok = res.statusCode >= 200 && res.statusCode < 400;
        row.durationMs = duration;
        row.tests = res.testResults ?? [];
      } catch (err) {
        row.error = err instanceof Error ? err.message : String(err);
        row.ok = false;
      }
      results[idx] = row;
      setRows([...results]);
      setProgress((p) => p + 1);
    };

    if (mode === 'sequential') {
      for (let i = 0; i < items.length; i++) {
        await executeOne(items[i], i);
      }
    } else {
      const pool = Math.max(1, concurrency);
      let cursor = 0;
      const worker = async () => {
        while (cursor < items.length) {
          const i = cursor++;
          await executeOne(items[i], i);
        }
      };
      await Promise.all(Array.from({ length: Math.min(pool, items.length) }, worker));
    }

    setRunning(false);
  };

  const passedTests = rows.reduce(
    (acc, r) => acc + r.tests.filter((t) => t.passed).length,
    0
  );
  const failedTests = rows.reduce((acc, r) => acc + r.tests.filter((t) => !t.passed).length, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <Play size={16} className="text-[var(--accent)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Collection Runner</h2>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-3">
        <label className="block">
          <span className="mb-1 block text-xs text-[var(--text-secondary)]">Collection</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-56 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="">Select a collection…</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-[var(--text-secondary)]">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'sequential' | 'parallel')}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
          </select>
        </label>

        {mode === 'parallel' && (
          <label className="block">
            <span className="mb-1 block text-xs text-[var(--text-secondary)]">Concurrency</span>
            <input
              type="number"
              min={1}
              max={20}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-24 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        )}

        <Button
          variant="primary"
          onClick={run}
          disabled={running || !collection || requests.length === 0}
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {running ? 'Running…' : `Run ${requests.length} requests`}
        </Button>
      </div>

      {collection && requests.length === 0 && (
        <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">
          This collection has no requests. Add requests under it first.
        </p>
      )}

      {running && (
        <div className="px-3 py-2">
          <div className="h-2 w-full overflow-hidden rounded bg-[var(--bg-tertiary)]">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{ width: `${(progress / Math.max(1, requests.length)) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {progress} / {requests.length}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 text-xs">
          <span className="text-[var(--text-secondary)]">{rows.length} requests</span>
          <span className="text-success">
            {rows.filter((r) => r.ok).length} passed
          </span>
          <span className="text-danger">{rows.filter((r) => !r.ok).length} failed</span>
          <span className="text-[var(--text-secondary)]">
            {passedTests} tests passed / {failedTests} failed
          </span>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Run a collection to see per-request results here.
          </p>
        ) : (
          <table className="w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2">Method</th>
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">URL</th>
                <th className="py-1 pr-2">Time</th>
                <th className="py-1">Tests</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.id}-${i}`} className="border-b border-[var(--border)]">
                  <td className="py-1 pr-2">
                    {r.error ? (
                      <span className="text-danger">
                        <XCircle size={14} className="inline" /> ERR
                      </span>
                    ) : r.ok ? (
                      <span className="text-success">
                        <CheckCircle2 size={14} className="inline" /> {r.status}
                      </span>
                    ) : (
                      <span className="text-danger">
                        <XCircle size={14} className="inline" /> {r.status}
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2 font-mono text-xs" style={{ color: METHOD_COLORS[r.method as keyof typeof METHOD_COLORS] ?? 'var(--text-secondary)' }}>{r.method}</td>
                  <td className="py-1 pr-2 text-[var(--text-primary)]">{r.name}</td>
                  <td className="max-w-[240px] py-1 pr-2 text-[var(--text-secondary)]">
                    <div className="truncate" title={r.url}>{r.url}</div>
                    {r.error && <span className="block break-all text-xs text-danger">{r.error}</span>}
                  </td>
                  <td className="py-1 pr-2 font-mono text-xs text-[var(--text-secondary)]">{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td>
                  <td className="py-1 text-[var(--text-secondary)]">
                    {r.tests.length > 0
                      ? `${r.tests.filter((t) => t.passed).length}/${r.tests.length}`
                      : '—'}
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
