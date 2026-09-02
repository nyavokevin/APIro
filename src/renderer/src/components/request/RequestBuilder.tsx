import { ChevronDown, Send } from 'lucide-react';
import type { HttpMethod, RequestData } from '@shared/types/request';
import { HTTP_METHODS, METHOD_COLORS } from '@shared/constants/methods';
import { syncParamsFromUrl } from '../../lib/urlParams';
import { Button } from '../ui/Button';

interface RequestBuilderProps {
  request: RequestData;
  loading: boolean;
  onChange: (patch: Partial<RequestData>) => void;
  onSend: () => void;
}

export function RequestBuilder({ request, loading, onChange, onSend }: RequestBuilderProps) {
  const handleUrlChange = (url: string) => {
    // Auto-sync: any key/value pairs in the URL query string are listed
    // in the Params table (rows keep their id/enabled state where possible).
    onChange({ url, params: syncParamsFromUrl(url, request.params) });
  };

  const handleMethodChange = (method: HttpMethod) => {
    onChange({ method });
  };

  return (
    <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] p-2">
      <div className="relative shrink-0">
        <select
          value={request.method}
          onChange={(e) => handleMethodChange(e.target.value as HttpMethod)}
          className="appearance-none rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] py-1.5 pl-3 pr-7 text-sm font-semibold outline-none focus:border-[var(--accent)]"
          style={{ color: METHOD_COLORS[request.method] }}
          aria-label="HTTP method"
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m} style={{ color: 'var(--text-primary)' }}>
              {m}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" strokeWidth={2} />
      </div>

      <input
        value={request.url}
        placeholder="https://api.example.com/endpoint"
        onChange={(e) => handleUrlChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSend();
        }}
        className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />

      <Button variant="primary" onClick={onSend} disabled={loading || !request.url} title="Send request — Ctrl+Enter in URL field">
        <Send size={14} /> {loading ? 'Sending…' : 'Send'}
      </Button>
    </div>
  );
}
