import { useEffect, useState } from 'react';
import type { RequestData } from '@shared/types/request';
import { CodeEditor } from '../ui/CodeEditor';
import { useTierGate } from '../../hooks/useTierGate';
import { TierLimitBanner } from '../license/TierLimitBanner';

interface TestsTabProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

function countAssertions(script: string): number {
  const m = script.match(/pm\.test\s*\(/g);
  return m ? m.length : 0;
}

export function TestsTab({ request, onChange }: TestsTabProps) {
  const lineCount = (request.testScript ?? '').split('\n').length;
  const charCount = (request.testScript ?? '').length;
  const assertionCount = countAssertions(request.testScript ?? '');
  const { usage, checkGate } = useTierGate();
  const [gateDenied, setGateDenied] = useState<import('../../hooks/useTierGate').GateResult | null>(null);
  const maxAssertions = usage?.tier === 'free' ? 5 : null;

  useEffect(() => {
    let cancelled = false;
    if (assertionCount === 0) { setGateDenied(null); return; }
    void checkGate('AddAssertion', { assertionCount }).then((res) => {
      if (cancelled) return;
      if (res.type === 'Denied') {
        setGateDenied(res);
      } else {
        setGateDenied(null);
      }
    });
    return () => { cancelled = true; };
  }, [assertionCount, checkGate]);

  const overLimit = maxAssertions != null && assertionCount > maxAssertions;
  const atLimit = maxAssertions != null && assertionCount >= maxAssertions;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {gateDenied && gateDenied.type === 'Denied' && (
        <TierLimitBanner result={gateDenied} onDismiss={() => setGateDenied(null)} />
      )}
      {atLimit && !gateDenied && maxAssertions != null && (
        <div className="px-3 py-2 text-xs" style={{ background: overLimit ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${overLimit ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)'}`, borderLeft: `2px solid ${overLimit ? '#EF4444' : '#F59E0B'}`, color: overLimit ? '#FCA5A5' : '#FDE68A' }}>
          {overLimit ? `You have ${assertionCount}/${maxAssertions} assertions — over Free limit. Tests still run, but delete some or upgrade to Pro for unlimited.` : `You have ${assertionCount}/${maxAssertions} assertions on Free — upgrade to Pro for unlimited.`}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 border bg-[#121215] px-2.5 py-1 text-[11px] font-medium tracking-[-0.01em] text-[#9FA3B5]"
          style={{ borderColor: '#232329' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" aria-hidden />
          Tests
        </span>
        <span className="text-xs" style={{ color: '#5A5E6E' }}>
          Assertions against the response
        </span>
        <span className="ml-auto hidden items-center gap-2 font-mono text-xs tabular-nums sm:inline-flex" style={{ color: '#5A5E6E' }}>
          <span className={overLimit ? 'text-[#EF4444]' : atLimit ? 'text-[#F59E0B]' : ''}>
            {maxAssertions != null ? `${assertionCount}/${maxAssertions} assertions` : `${assertionCount} assertions`}
          </span>
          <span>·</span>
          <span>{charCount ? `${lineCount} lines · ${charCount} chars` : 'empty'}</span>
        </span>
      </div>

      <div
        className="group flex flex-1 flex-col overflow-hidden border bg-[#0E0E10] transition-colors duration-200 hover:border-[#2E2E36] focus-within:border-[#8B5CF6]"
        style={{ borderColor: '#232329' }}
        onFocusCapture={(e) => {
          const t = e.currentTarget as HTMLDivElement;
          t.style.borderColor = '#8B5CF6';
          t.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)';
        }}
        onBlurCapture={(e) => {
          const t = e.currentTarget as HTMLDivElement;
          if (!t.contains(e.relatedTarget as Node)) {
            t.style.borderColor = '#232329';
            t.style.boxShadow = 'none';
          }
        }}
      >
        <CodeEditor
          value={request.testScript ?? ''}
          onChange={(testScript) => onChange({ testScript })}
          placeholder={'// test script — e.g. expect(response.status).toBe(200)\n// pm.test("status is 200", () => pm.response.to.have.status(200))\n// pm.expect(pm.response.json().id).to.be.a("string")\n'}
          className="flex-1 border-0"
          language="text"
          tabSize={2}
        />
        <div
          className="flex items-center justify-between border-t bg-[#070709] px-3 py-1.5 font-mono text-xs tabular-nums"
          style={{ borderColor: '#232329', color: '#7A7F93' }}
        >
          <span>JS · tests</span>
          <span className="hidden gap-1.5 sm:flex">
            <span className="border bg-[#121215] px-1.5 py-0.5 text-[11px]" style={{ borderColor: '#232329' }}>
              ⇥ 2␣
            </span>
            <span className="border bg-[#121215] px-1.5 py-0.5 text-[11px]" style={{ borderColor: '#232329' }}>
              expect() available
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
