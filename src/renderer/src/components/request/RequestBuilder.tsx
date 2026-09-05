import { ChevronDown, Send, Loader2 } from 'lucide-react';
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

  const isValidUrl = request.url.trim().length > 0;

  return (
    <div
      className="flex items-center gap-2.5 shrink-0 group"
      style={{
        background: '#121215',
        border: '1px solid #232329',
        borderRadius: '0px',
        padding: '14px',
        margin: '14px 28px 0 28px',
        boxShadow: '0 1px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <div className="relative shrink-0">
        <select
          value={request.method}
          onChange={(e) => handleMethodChange(e.target.value as HttpMethod)}
          className="appearance-none outline-none font-mono font-semibold transition-colors hover:border-[#2E2E36] focus:border-[#8B5CF6]"
          style={{
            border: '1px solid #232329',
            borderRadius: '0px',
            padding: '8px 36px 8px 12px',
            fontSize: '13px',
            lineHeight: '20px',
            color: METHOD_COLORS[request.method],
            background: '#0E0E10',
            height: '40px',
            letterSpacing: '0.02em',
          }}
          aria-label="HTTP method"
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m} style={{ color: '#E6E8F0', background: '#121215' }}>
              {m}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A7F93] group-hover:text-[#9FA3B5] transition-colors" strokeWidth={2.2} />
      </div>

      <div className="relative flex-1 flex items-center">
        <input
          value={request.url}
          placeholder="https://api.example.com/endpoint  ·  try {{baseUrl}}/users"
          onChange={(e) => handleUrlChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!loading && request.url.trim()) onSend();
            }
          }}
          className="w-full bg-[#0E0E10] text-[#E6E8F0] placeholder:text-[#5A5E6E] outline-none font-mono transition-all focus:bg-[#121215]"
          style={{
            height: '40px',
            border: '1px solid #232329',
            borderRadius: '0px',
            padding: '0 14px',
            fontSize: '13px',
            lineHeight: '20px',
          }}
          spellCheck={false}
          autoComplete="off"
        />
        {!isValidUrl && (
          <span className="pointer-events-none absolute right-3 hidden lg:flex items-center gap-1 rounded bg-[#1A1A1E] px-1.5 py-0.5 text-[10px] font-medium text-[#7A7F93] border border-[#232329]">
            ↵ Send
          </span>
        )}
      </div>

      <div className="h-6 w-px shrink-0 self-center bg-[#232329]" aria-hidden />
      <SecurityButton requestId={request.id} />

      <button
        onClick={onSend}
        disabled={loading || !isValidUrl}
        title="Send request — Enter in URL field"
        className="inline-flex items-center justify-center gap-2 font-semibold disabled:opacity-45 disabled:cursor-not-allowed shrink-0 active:scale-[0.98] transition-all duration-200"
        style={{
          background: loading || !isValidUrl ? '#6D28D9' : '#8B5CF6',
          color: '#FFFFFF',
          border: '1px solid transparent',
          borderRadius: '0px',
          padding: '8px 20px',
          fontSize: '13px',
          lineHeight: '20px',
          height: '40px',
          fontWeight: 640,
          letterSpacing: '-0.01em',
          boxShadow: isValidUrl && !loading ? '0 0 14px rgba(139,92,246,0.28), inset 0 1px 0 rgba(255,255,255,0.14)' : 'none',
        }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} strokeWidth={2} />}
        {loading ? 'Sending…' : 'Send'}
        {!loading && isValidUrl && <span className="hidden sm:inline opacity-70 text-[11px] font-normal ml-0.5">↵</span>}
      </button>
    </div>
  );
}
