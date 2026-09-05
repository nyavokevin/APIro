import { CheckCircle2, XCircle, Clock3, Beaker } from 'lucide-react';
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
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 py-12 text-center animate-fadeUp">
        <div className="flex h-12 w-12 items-center justify-center bg-[#121215]" style={{ border: '1px solid #232329' }}>
          <Beaker size={20} className="text-[#7A7F93]" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-semibold tracking-tight text-[#E6E8F0]">No tests have run yet</p>
        <p className="max-w-[34ch] text-xs leading-relaxed text-[#7A7F93]">
          Add assertions in the <span className="font-medium text-[#E6E8F0]">Tests</span> tab and send the request. Results and durations appear here.
        </p>
      </div>
    );
  }

  const passed = data.filter((t) => t.passed).length;
  const failed = data.length - passed;

  return (
    <div className="flex h-full flex-col bg-[#070709]">
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2.5 shrink-0"
        style={{ background: '#0E0E10', borderBottom: '1px solid #232329' }}
      >
        <span className="flex h-7 w-7 items-center justify-center bg-[rgba(139,92,246,0.12)] text-[#8B5CF6]" style={{ border: '1px solid rgba(139,92,246,0.22)' }}>
          <Beaker size={14} strokeWidth={1.8} />
        </span>
        <span className="text-sm font-semibold tracking-tight text-[#E6E8F0]">Test Results</span>
        <div className="ml-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold tabular-nums" style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.20)' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" /> {passed} passed
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold tabular-nums" style={{ background: failed ? 'rgba(239,68,68,0.12)' : 'rgba(113,118,138,0.08)', color: failed ? '#EF4444' : '#7A7F93', border: `1px solid ${failed ? 'rgba(239,68,68,0.20)' : '#232329'}` }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: failed ? '#EF4444' : '#7A7F93' }} /> {failed} failed
          </span>
        </div>
        <span className="ml-auto text-xs tabular-nums text-[#7A7F93]">{data.length} total</span>
      </div>
      <ul className="flex-1 space-y-2 overflow-auto p-3">
        {data.map((t, i) => (
          <li
            key={i}
            className="group flex items-start gap-3 bg-[#121215] px-3 py-3 transition-all duration-200 hover:-translate-y-[1px] hover:border-[#2E2E36] hover:bg-[#16161A] active:scale-[0.995] animate-fadeUp"
            style={{
              border: `1px solid ${t.passed ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'}`,
              borderLeft: `2px solid ${t.passed ? '#10B981' : '#EF4444'}`,
              animationDelay: `${i * 28}ms`,
            }}
          >
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center"
              style={{
                background: t.passed ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)',
                border: `1px solid ${t.passed ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.28)'}`,
                color: t.passed ? '#10B981' : '#EF4444',
              }}
            >
              {t.passed ? <CheckCircle2 size={13} strokeWidth={2} /> : <XCircle size={13} strokeWidth={2} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium leading-tight text-[#E6E8F0]">{t.name}</p>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${t.passed ? 'text-[#10B981]' : 'text-[#EF4444]'}`}
                  style={{
                    background: t.passed ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${t.passed ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)'}`,
                    letterSpacing: '0.04em',
                  }}
                >
                  {t.passed ? 'Pass' : 'Fail'}
                </span>
                {t.durationMs != null && (
                  <span className="ml-auto inline-flex items-center gap-1 font-mono text-xs tabular-nums text-[#7A7F93]">
                    <Clock3 size={11} /> {t.durationMs} ms
                  </span>
                )}
              </div>
              {!t.passed && t.error && (
                <p className="mt-1.5 break-all rounded bg-[#070709] px-2 py-1.5 font-mono text-xs leading-relaxed text-[#EF4444]" style={{ border: '1px solid rgba(239,68,68,0.18)' }}>
                  {t.error}
                </p>
              )}
              {t.passed && t.error && (
                <p className="mt-1 break-all font-mono text-xs text-[#7A7F93]">{t.error}</p>
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
  const passed = data.length - failed;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold tabular-nums"
      style={{
        background: failed ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
        color: failed ? '#EF4444' : '#10B981',
        border: `1px solid ${failed ? 'rgba(239,68,68,0.22)' : 'rgba(16,185,129,0.22)'}`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: failed ? '#EF4444' : '#10B981' }} />
      {passed}/{data.length} tests
    </span>
  );
}
