import type { RequestData } from '@shared/types/request';
import { CodeEditor } from '../ui/CodeEditor';

interface PreRequestTabProps {
  request: RequestData;
  onChange: (patch: Partial<RequestData>) => void;
}

export function PreRequestTab({ request, onChange }: PreRequestTabProps) {
  return (
    <div className="flex h-full flex-col p-3">
      <p className="mb-2 text-xs text-[var(--text-secondary)]">
        Run JavaScript before the request is sent.
      </p>
      <CodeEditor
        value={request.preRequestScript ?? ''}
        onChange={(preRequestScript) => onChange({ preRequestScript })}
        placeholder="// pre-request script"
        className="flex-1"
      />
    </div>
  );
}
