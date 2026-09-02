import { useState } from 'react';
import { Sparkles, Loader2, FileText, Wand2 } from 'lucide-react';
import type { RequestData, ResponseData, AIChannel } from '@shared/types/request';
import { api } from '../../services/api';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

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
  const [error, setError] = useState<string | null>(null);

  const run = async (ch: AIChannel) => {
    if (!request || !response) return;
    setChannel(ch);
    setLoading(true);
    setError(null);
    try {
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
      setResult(res.suggestion ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={() => onClose?.()} title="AI Assistant">
      <div className="space-y-3">
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

        {loading && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" /> Thinking…
          </div>
        )}

        {error && (
          <div className="rounded border border-danger bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        {!loading && result && (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-sm text-[var(--text-primary)]">
            {result}
          </pre>
        )}

        {!loading && !result && !error && (
          <p className="text-sm text-[var(--text-secondary)]">
            Pick an action above. The AI will use the current request and response.
          </p>
        )}
      </div>
      {onClose && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={() => onClose()}>
            Close
          </Button>
        </div>
      )}
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
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        <Sparkles size={14} /> AI Help
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
