import { useState } from 'react';
import type { ResponseData, RequestData } from '@shared/types/request';
import { STATUS_CODE_COLORS } from '@shared/constants/methods';
import { JsonTree } from './JsonTree';
import { HeadersView } from './HeadersView';
import { HtmlPreview } from './HtmlPreview';
import { AIHelpButton } from '../ai/AIAssistant';

interface ResponseViewerProps {
  response: ResponseData | null;
  loading: boolean;
  request?: RequestData | null;
}

type View = 'preview' | 'body' | 'raw' | 'headers' | 'timeline';

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return STATUS_CODE_COLORS.success;
  if (code >= 300 && code < 400) return STATUS_CODE_COLORS.redirect;
  if (code >= 400 && code < 500) return STATUS_CODE_COLORS.clientError;
  if (code >= 500) return STATUS_CODE_COLORS.serverError;
  return 'var(--text-secondary)';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isHtml(contentType: string, body: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes('text/html')) return true;
  const trimmed = body.trim().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || trimmed.startsWith('<head') || trimmed.startsWith('<body');
}

export function ResponseViewer({ response, loading, request }: ResponseViewerProps) {
  const [view, setView] = useState<View>('body');

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
        Sending request…
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
        Send a request to see the response.
      </div>
    );
  }

  const parsed =
    response.contentType.includes('json') || response.body.trim().startsWith('{') || response.body.trim().startsWith('[')
      ? tryParseJson(response.body)
      : null;
  const color = statusColor(response.statusCode);
  const html = isHtml(response.contentType, response.body);
  // Default view: html -> preview, json -> body (tree), otherwise raw
  const effectiveView = view === 'body' && html && parsed === null ? 'preview' : view;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 text-sm">
        <span
          className="rounded px-2 py-0.5 font-semibold"
          style={{ color, border: `1px solid ${color}` }}
        >
          {response.statusCode} {response.statusText}
        </span>
        <span className="text-[var(--text-secondary)]">{response.responseTime} ms</span>
        <span className="text-[var(--text-secondary)]">{formatSize(response.size)}</span>
        {response.error && (
          <span className="max-w-[260px] truncate text-danger" title={response.error}>Error: {response.error}</span>
        )}
        <AIHelpButton request={request ?? null} response={response} />
        <div className="ml-auto flex gap-1">
          {([
            ['preview', 'Preview'],
            ['body', 'Body'],
            ['raw', 'Raw'],
            ['headers', 'Headers'],
            ['timeline', 'Timeline'],
          ] as const).map(([v, label]) => {
            const disabled = v === 'preview' && !html;
            return (
              <button
                key={v}
                onClick={() => !disabled && setView(v as View)}
                disabled={disabled}
                className={`rounded px-2 py-0.5 text-xs capitalize hover:bg-[var(--bg-tertiary)] ${
                  effectiveView === v
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : disabled
                      ? 'text-[var(--text-secondary)] opacity-40 cursor-not-allowed'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title={disabled ? 'No HTML content' : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {effectiveView === 'headers' ? (
          <HeadersView headers={response.headers} />
        ) : effectiveView === 'timeline' ? (
          <div className="space-y-2 font-mono text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>TTFB: <span className="text-[var(--text-primary)]">{response.timeline.ttfb} ms</span></div>
              <div>Download: <span className="text-[var(--text-primary)]">{response.timeline.download} ms</span></div>
              <div>Total: <span className="text-[var(--text-primary)]">{response.timeline.total} ms</span></div>
              <div>Size: <span className="text-[var(--text-primary)]">{formatSize(response.size)}</span></div>
            </div>
            <div className="mt-2 h-2 w-full rounded bg-[var(--bg-tertiary)] overflow-hidden flex">
              <div className="bg-[var(--accent)]" style={{ width: `${Math.min(100, (response.timeline.ttfb / Math.max(1, response.timeline.total)) * 100)}%` }} />
              <div className="bg-[var(--accent)] opacity-60" style={{ width: `${Math.min(100, (response.timeline.download / Math.max(1, response.timeline.total)) * 100)}%` }} />
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-[var(--text-secondary)]">{JSON.stringify(response.timeline, null, 2)}</pre>
          </div>
        ) : effectiveView === 'preview' && html ? (
          <div className="h-full w-full overflow-hidden rounded border border-[var(--border)]">
            <HtmlPreview html={response.body} />
          </div>
        ) : effectiveView === 'raw' ? (
          <pre className="whitespace-pre-wrap break-all font-mono text-sm text-[var(--text-primary)]">
            {response.body}
          </pre>
        ) : parsed !== null ? (
          <JsonTree data={parsed} />
        ) : (
          <pre className="whitespace-pre-wrap break-all font-mono text-sm text-[var(--text-primary)]">
            {response.body}
          </pre>
        )}
      </div>
    </div>
  );
}
