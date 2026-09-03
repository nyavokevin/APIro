import { ChevronDown, Send } from 'lucide-react';
import type { HttpMethod, RequestData } from '@shared/types/request';
import { HTTP_METHODS, METHOD_COLORS } from '@shared/constants/methods';
import { syncParamsFromUrl } from '../../lib/urlParams';
import { SecurityButton } from './SecurityButton';

interface RequestBuilderProps {
  request: RequestData;
  loading: boolean;
  onChange: (patch: Partial<RequestData>) => void;
  onSend: () => void;
}

export function RequestBuilder({ request, loading, onChange, onSend }: RequestBuilderProps) {
  const handleUrlChange = (url: string) => {
    onChange({ url, params: syncParamsFromUrl(url, request.params) });
  };

  const handleMethodChange = (method: HttpMethod) => {
    onChange({ method });
  };

  return (
    <div
      className="flex items-center gap-3 bg-[#121212] shrink-0"
      style={{ border: '1px solid #262626', borderRadius: '0px', padding: '20px', margin: '16px 32px 0 32px' }}
    >
      <div className="relative shrink-0">
        <select
          value={request.method}
          onChange={(e) => handleMethodChange(e.target.value as HttpMethod)}
          className="appearance-none bg-transparent outline-none font-mono font-semibold"
          style={{
            border: '1px solid #262626',
            borderRadius: '0px',
            padding: '8px 32px 8px 12px',
            fontSize: '13px',
            lineHeight: '20px',
            color: METHOD_COLORS[request.method],
            background: 'transparent',
            height: '40px',
          }}
          aria-label="HTTP method"
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m} style={{ color: '#E2E8F0', background: '#121212' }}>
              {m}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#8F909E]" strokeWidth={2} />
      </div>

      <input
        value={request.url}
        placeholder="https://api.example.com/endpoint"
        onChange={(e) => handleUrlChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSend();
        }}
        className="flex-1 bg-[#121212] text-[#E2E8F0] placeholder:text-[#8F909E] outline-none font-mono"
        style={{
          height: '40px',
          border: '1px solid #262626',
          borderRadius: '0px',
          padding: '0 16px',
          fontSize: '13px',
          lineHeight: '20px',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = '#8B5CF6')}
        onBlur={(e) => (e.currentTarget.style.borderColor = '#262626')}
      />

      <SecurityButton requestId={request.id} />

      <button
        onClick={onSend}
        disabled={loading || !request.url}
        title="Send request — Ctrl+Enter in URL field"
        className="inline-flex items-center justify-center gap-2 font-semibold disabled:opacity-50 shrink-0"
        style={{
          background: '#8B5CF6',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '0px',
          padding: '8px 20px',
          fontSize: '13px',
          lineHeight: '20px',
          height: '40px',
        }}
        onMouseEnter={(e) => {
          if (!loading && request.url) (e.currentTarget as HTMLButtonElement).style.background = '#7C3AED';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = '#8B5CF6';
        }}
      >
        <Send size={14} /> {loading ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
}
