import { FlaskConical, AlertTriangle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useUiStore } from '../../stores/uiStore';
import { useRequestStore } from '../../stores/requestStore';
import { useMemo } from 'react';
import { useCollectionStore } from '../../stores/collectionStore';
import { computeCoverage } from '../../lib/scanner/testCoverage';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export function TestingSummaryCard() {
  const testResults = useRequestStore((s) => s.testResults);
  const collections = useCollectionStore((s) => s.collections);
  const workspaceCollections = useWorkspaceStore((s) => s.collections);

  // Try to get scanned routes from last scan if available (stored in localStorage via scanner history or via workspace?)
  // For now, we attempt to read last scan from localStorage fallback or just compute 0 if none
  const coverage = useMemo(() => {
    try {
      const raw = localStorage.getItem('apiforge-last-scan');
      if (raw) {
        const scan = JSON.parse(raw);
        if (scan?.routes && Array.isArray(scan.routes)) {
          const allRequests: any[] = [];
          const walk = (nodes: any[]) => {
            for (const n of nodes) {
              if (n.type === 'request' && n.data) allRequests.push(n.data);
              if (n.children) walk(n.children);
            }
          };
          walk(collections.length ? collections : workspaceCollections);
          return computeCoverage(scan.routes, allRequests);
        }
      }
    } catch {}
    return null;
  }, [collections, workspaceCollections]);

  const lastRun = testResults.length > 0 ? { total: testResults.length, passed: testResults.filter((r) => r.passed).length, failed: testResults.filter((r) => !r.passed).length } : null;
  const hasFailed = lastRun ? lastRun.failed > 0 : false;
  const hasCoverage = coverage && coverage.total > 0;

  const handleClick = () => useUiStore.getState().setActivePage('testing');

  return (
    <button
      onClick={handleClick}
      className="group flex w-full flex-col text-left transition-all duration-200 hover:-translate-y-[1px] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(139,92,246,0.35)]"
      style={{
        background: '#121215',
        border: '1px solid #232329',
        borderLeft: hasFailed ? '2px solid #EF4444' : hasCoverage && coverage.coveragePercent < 50 ? '2px solid #F59E0B' : '2px solid #232329',
        boxShadow: hasFailed ? '0 0 16px rgba(239,68,68,0.08)' : '0 1px 6px rgba(0,0,0,0.18)',
      }}
    >
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid #1E1E24' }}>
        <span className="flex h-7 w-7 items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.22)', color: '#10B981' }}>
          <FlaskConical size={14} />
        </span>
        <span className="text-sm font-semibold tracking-tight" style={{ color: '#E6E8F0', letterSpacing: '-0.01em' }}>Testing</span>
        {lastRun && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs tabular-nums px-1.5 py-0.5" style={{ background: hasFailed ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)', border: `1px solid ${hasFailed ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)'}`, color: hasFailed ? '#EF4444' : '#10B981' }}>
            {hasFailed ? <XCircle size={11} /> : <CheckCircle2 size={11} />} {lastRun.passed}/{lastRun.total}
          </span>
        )}
      </div>

      <div className="flex-1 p-4 space-y-2.5">
        {!hasCoverage ? (
          <div>
            <p className="text-sm" style={{ color: '#9FA3B5' }}>Run scanner to see coverage</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: '#7A7F93' }}>Coverage appears after your first source scan. It compares scanned routes vs. existing requests.</p>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tabular-nums" style={{ color: coverage.coveragePercent >= 80 ? '#10B981' : coverage.coveragePercent >= 50 ? '#F59E0B' : '#EF4444' }}>{coverage.coveragePercent}%</span>
              <span className="text-sm" style={{ color: '#9FA3B5' }}>route coverage</span>
              <span className="ml-auto text-xs tabular-nums" style={{ color: '#7A7F93' }}>{coverage.covered.length}/{coverage.total} routes</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden" style={{ background: '#070709', border: '1px solid #232329' }}>
              <div className="h-full transition-all duration-500" style={{ width: `${coverage.coveragePercent}%`, background: coverage.coveragePercent >= 80 ? '#10B981' : coverage.coveragePercent >= 50 ? '#F59E0B' : '#EF4444' }} />
            </div>
            <div className="mt-1 text-xs" style={{ color: '#5A5E6E' }}>{coverage.uncovered.length} routes have no request</div>
          </div>
        )}

        {lastRun ? (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#5A5E6E' }}>
            <Clock size={11} /> Last run: {lastRun.passed}/{lastRun.total} {hasFailed ? 'failed' : 'passed'}
            {hasFailed && <span className="ml-auto inline-flex items-center gap-1 text-xs" style={{ color: '#EF4444' }}><AlertTriangle size={11} /> {lastRun.failed} failed</span>}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#5A5E6E' }}>
            <Clock size={11} /> No runs yet
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium" style={{ background: '#0E0E10', borderTop: '1px solid #232329', color: '#8B5CF6' }}>
        <span className="group-hover:underline">View →</span>
        {hasFailed && <span className="text-[11px] font-bold uppercase" style={{ color: '#EF4444' }}>failed</span>}
      </div>
    </button>
  );
}
