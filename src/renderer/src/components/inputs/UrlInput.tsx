import { ChevronDown, Send } from 'lucide-react';
import type { HttpMethod } from '@shared/types/request';
import { HTTP_METHODS, METHOD_COLORS } from '@shared/constants/methods';

interface UrlInputProps {
  method: HttpMethod;
  url: string;
  loading?: boolean;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
}

export function UrlInput({ method, url, loading = false, onMethodChange, onUrlChange, onSend }: UrlInputProps) {
  return (
    <div className="flex items-center gap-3 bg-[#121212]" style={{ border: '1px solid #262626', borderRadius: '0px', padding: '12px' }}>
      <div className="relative shrink-0">
        <select
          value={method}
          onChange={(e) => onMethodChange(e.target.value as HttpMethod)}
          className="appearance-none bg-transparent outline-none font-mono font-semibold"
          style={{
            border: '1px solid #262626',
            borderRadius: '0px',
            padding: '8px 28px 8px 12px',
            fontSize: '13px',
            color: METHOD_COLORS[method],
            background: 'transparent',
            height: '40px',
          }}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m} value={m} style={{ background: '#121212', color: '#E2E8F0' }}>{m}</option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#8F909E]" />
      </div>

      <input
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSend(); }}
        placeholder="https://api.example.com/endpoint"
        className="flex-1 bg-[#121212] text-[#E2E8F0] placeholder:text-[#8F909E] outline-none font-mono"
        style={{ height: '40px', border: '1px solid #262626', borderRadius: '0px', padding: '0 16px', fontSize: '13px' }}
        onFocus={(e) => (e.currentTarget.style.borderColor = '#8B5CF6')}
        onBlur={(e) => (e.currentTarget.style.borderColor = '#262626')}
      />

      <button
        onClick={onSend}
        disabled={loading || !url}
        className="inline-flex items-center gap-2 font-semibold disabled:opacity-50"
        style={{ background: '#8B5CF6', color: '#FFFFFF', border: 'none', borderRadius: '0px', padding: '8px 20px', height: '40px', fontSize: '13px' }}
        onMouseEnter={(e) => { if (!loading && url) (e.currentTarget as HTMLButtonElement).style.background = '#7C3AED'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#8B5CF6'; }}
      >
        <Send size={14} /> {loading ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
}
