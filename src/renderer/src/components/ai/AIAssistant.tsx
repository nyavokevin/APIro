import { useState } from 'react';
import { Sparkles, Loader2, FileText, Wand2, ExternalLink, Cpu } from 'lucide-react';
import type { RequestData, ResponseData, AIChannel } from '@shared/types/request';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { getOpenRouterConfig, tryOpenRouterOrFallback } from '../../lib/openRouter';

interface AIAssistantProps {
  request: RequestData | null;
  response: ResponseData | null;
  defaultChannel?: AIChannel;
  open?: boolean;
  onClose?: () => void;
}

export function AIAssistant({
  request,
  response,
  defaultChannel = 'error',
  open = true,
  onClose,
}: AIAssistantProps) {
  const [channel, setChannel] = useState<AIChannel>(defaultChannel);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [via, setVia] = useState<'openrouter' | 'local' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cfg = getOpenRouterConfig();
  const usingOpenRouter = !!cfg?.enabled;

  const run = async (ch: AIChannel) => {
    if (!request || !response) return;
    setChannel(ch);
    setLoading(true);
    setError(null);
    setVia(null);
    try {
      const fallback = async () => {
        const res = await api.ai.analyze({
          channel: ch,
          data: {
            request: {
              method: request.method,
              url: request.url,
              headers: request.headers,
              body: request.body,
            },
            response: {
              statusCode: response.statusCode,
              statusText: response.statusText,
              headers: response.headers,
              body: response.body,
            },
          },
        });
        return res.suggestion ?? '';
      };

      const { text, via: source } = await tryOpenRouterOrFallback(
        ch,
        { method: request.method, url: request.url, headers: request.headers, body: request.body },
        { statusCode: response.statusCode, statusText: response.statusText, headers: response.headers, body: response.body },
        fallback
      );
      setResult(text);
      setVia(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={() => onClose?.()} title="AI Assistant">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={channel === 'error' ? 'primary' : 'secondary'}
              onClick={() => run('error')}
              disabled={loading}
            >
              <Sparkles size={14} /> Analyze Error
            </Button>
            <Button
              size="sm"
              variant={channel === 'tests' ? 'primary' : 'secondary'}
              onClick={() => run('tests')}
              disabled={loading}
            >
              <Wand2 size={14} /> Generate Tests
            </Button>
            <Button
              size="sm"
              variant={channel === 'explain' ? 'primary' : 'secondary'}
              onClick={() => run('explain')}
              disabled={loading}
            >
              <FileText size={14} /> Explain
            </Button>
          </div>
          {usingOpenRouter && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded bg-[rgba(139,92,246,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-[#8B5CF6] border border-[rgba(139,92,246,0.22)]">
              <Cpu size={10} /> {cfg?.model.split('/').pop()?.slice(0, 14)}
            </span>
          )}
        </div>

        {!usingOpenRouter && (
          <p className="text-xs flex items-center gap-1.5" style={{ color: '#7A7F93' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#7A7F93]" /> Local heuristic — no cloud. Configure OpenRouter in Settings for deeper analysis.
          </p>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm" style={{ color: '#9FA3B5' }}>
            <Loader2 size={16} className="animate-spin text-[#8B5CF6]" /> Thinking… {usingOpenRouter ? 'via OpenRouter' : 'locally'}
          </div>
        )}

        {error && (
          <div className="rounded border p-3 text-sm" style={{ borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        {!loading && result && (
          <>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap border p-3 text-sm leading-relaxed" style={{ borderColor: '#232329', background: '#0E0E10', color: '#E6E8F0', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
              {result}
            </pre>
            {via && (
              <p className="text-[11px] flex items-center gap-1.5" style={{ color: '#5A5E6E' }}>
                {via === 'openrouter' ? <><Cpu size={10} className="text-[#8B5CF6]" /> via OpenRouter · {cfg?.model}</> : <><span className="h-1.5 w-1.5 rounded-full bg-[#7A7F93]" /> via local heuristic · offline-capable</>}
              </p>
            )}
          </>
        )}

        {!loading && !result && !error && (
          <p className="text-sm leading-relaxed" style={{ color: '#9FA3B5' }}>
            Pick an action above. The AI will use the current request and response. Results are <span className="font-medium text-[#E6E8F0]">local-first</span> unless OpenRouter is configured.
          </p>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <a href="https://openrouter.ai/" target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 text-[#7A7F93] hover:text-[#9FA3B5] transition-colors">
          OpenRouter <ExternalLink size={10} />
        </a>
        {onClose && (
          <Button variant="ghost" onClick={() => onClose()}>
            Close
          </Button>
        )}
      </div>
    </Modal>
  );
}

interface AIHelpButtonProps {
  request: RequestData | null;
  response: ResponseData | null;
}

export function AIHelpButton({ request, response }: AIHelpButtonProps) {
  const [open, setOpen] = useState(false);
  if (!request || !response) return null;
  const showOnError = response.statusCode >= 400;
  if (!showOnError) return null;
  const cfg = getOpenRouterConfig();
  const label = cfg?.enabled ? 'AI Help · OpenRouter' : 'AI Help · Local';
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)} className="gap-1.5">
        <Sparkles size={14} /> {label}
      </Button>
      {open && (
        <AIAssistant
          request={request}
          response={response}
          defaultChannel="error"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
