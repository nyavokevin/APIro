import { CheckCircle2, XCircle } from 'lucide-react';
import type { TestResult } from '@shared/types/request';
import { useRequestStore } from '../../stores/requestStore';

interface TestResultsProps {
  results?: TestResult[];
}

export function TestResults({ results }: TestResultsProps) {
  const storeResults = useRequestStore((s) => s.testResults);
  const data = results ?? storeResults;

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
        No tests have run yet. Add tests in the Tests tab and send the request.
      </div>
    );
  }

  const passed = data.filter((t) => t.passed).length;
  const failed = data.length - passed;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 text-sm">
        <span className="font-semibold text-[var(--text-primary)]">Test Results</span>
        <span className="text-success">{passed} passed</span>
        <span className="text-danger">{failed} failed</span>
        <span className="text-[var(--text-secondary)]">({data.length} total)</span>
      </div>
      <ul className="flex-1 space-y-1 overflow-auto p-3">
        {data.map((t, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2"
          >
            {t.passed ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
            ) : (
              <XCircle size={16} className="mt-0.5 shrink-0 text-danger" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-[var(--text-primary)]">{t.name}</p>
              {!t.passed && t.error && (
                <p className="break-all font-mono text-xs text-danger">{t.error}</p>
              )}
              {t.durationMs != null && (
                <p className="text-xs text-[var(--text-secondary)]">{t.durationMs} ms</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TestResultsBadge() {
  const data = useRequestStore((s) => s.testResults);
  if (!data || data.length === 0) return null;
  const failed = data.filter((t) => !t.passed).length;
  return (
    <span
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
        failed > 0 ? 'text-danger' : 'text-success'
      }`}
      >
        {data.length - failed}/{data.length} tests
    </span>
  );
}
