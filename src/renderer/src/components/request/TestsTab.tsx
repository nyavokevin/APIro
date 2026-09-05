import type { RequestData } from '@shared/types/request';
import { CodeEditor } from '../ui/CodeEditor';

interface TestsTabProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

export function TestsTab({ request, onChange }: TestsTabProps) {
  const lineCount = (request.testScript ?? '').split('\n').length;
  const charCount = (request.testScript ?? '').length;
  return (
    <div className="flex h-full flex-col gap-3 p-4">
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
        <span className="ml-auto hidden font-mono text-xs tabular-nums sm:inline" style={{ color: '#5A5E6E' }}>
          {charCount ? `${lineCount} lines · ${charCount} chars` : 'empty'}
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
