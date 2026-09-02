import type { RequestData } from '@shared/types/request';
import { CodeEditor } from '../ui/CodeEditor';

interface TestsTabProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

export function TestsTab({ request, onChange }: TestsTabProps) {
  return (
    <div className="flex h-full flex-col p-3">
      <p className="mb-2 text-xs text-[var(--text-secondary)]">
        Run JavaScript assertions against the response.
      </p>
      <CodeEditor
        value={request.testScript ?? ''}
        onChange={(testScript) => onChange({ testScript })}
        placeholder="// test script — e.g. expect(response.status).toBe(200)"
        className="flex-1"
      />
    </div>
  );
}
