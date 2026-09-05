import { useRef, type TextareaHTMLAttributes, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

interface CodeEditorProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  language?: 'json' | 'xml' | 'graphql' | 'text' | 'form-data' | 'urlencoded' | 'none';
  tabSize?: number;
  onFormat?: () => void;
}

export function CodeEditor({ value, onChange, className, language = 'text', tabSize = 2, onFormat, ...props }: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = ref.current;
    if (!el) return;

    // Shift+Alt+F → format
    if (e.shiftKey && e.altKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      onFormat?.();
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const indent = ' '.repeat(tabSize);

    // Tab / Shift+Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      const before = value.slice(0, start);
      const after = value.slice(end);
      const selected = value.slice(start, end);

      if (e.shiftKey) {
        // Dedent: remove up to tabSize spaces at start of each selected line
        if (start === end) {
          // No selection: remove indent before cursor
          const lineStart = before.lastIndexOf('\n') + 1;
          const lineBeforeCursor = before.slice(lineStart);
          const dedented = lineBeforeCursor.replace(new RegExp(`^ {1,${tabSize}}`), '');
          const removed = lineBeforeCursor.length - dedented.length;
          if (removed > 0) {
            const next = before.slice(0, lineStart) + dedented + after;
            onChange(next);
            requestAnimationFrame(() => {
              el.selectionStart = el.selectionEnd = start - removed;
            });
          }
        } else {
          const lines = selected.split('\n');
          const dedented = lines.map((l) => l.replace(new RegExp(`^ {1,${tabSize}}`), '')).join('\n');
          const next = before + dedented + after;
          onChange(next);
          requestAnimationFrame(() => {
            el.selectionStart = start;
            el.selectionEnd = start + dedented.length;
          });
        }
      } else {
        if (start !== end && selected.includes('\n')) {
          // Indent each selected line
          const lines = selected.split('\n');
          const indented = lines.map((l) => indent + l).join('\n');
          const next = before + indented + after;
          onChange(next);
          requestAnimationFrame(() => {
            el.selectionStart = start;
            el.selectionEnd = start + indented.length;
          });
        } else if (start !== end) {
          // Replace selection with indent
          const next = before + indent + after;
          onChange(next);
          requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = start + indent.length;
          });
        } else {
          const next = before + indent + after;
          onChange(next);
          requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = start + indent.length;
          });
        }
      }
      return;
    }

    // Enter: auto-indent
    if (e.key === 'Enter') {
      e.preventDefault();
      const before = value.slice(0, start);
      const after = value.slice(end);
      const lineStart = before.lastIndexOf('\n') + 1;
      const currentLine = before.slice(lineStart);
      const leading = currentLine.match(/^\s*/)?.[0] ?? '';
      const trimmed = currentLine.trimEnd();
      const lastChar = trimmed.slice(-1);
      const isJsonXml = language === 'json' || language === 'xml' || language === 'graphql';
      const extra = isJsonXml && (lastChar === '{' || lastChar === '[' || lastChar === '(' || lastChar === '>') ? indent : '';
      const insertion = '\n' + leading + extra;
      // If next char is closing bracket, put it on new line with base indent
      const nextChar = after[0];
      const isClosing = isJsonXml && nextChar && ['}', ']', ')'].includes(nextChar);
      const finalInsert = isClosing ? insertion + '\n' + leading : insertion;
      const next = before + finalInsert + after;
      onChange(next);
      requestAnimationFrame(() => {
        const pos = start + insertion.length;
        el.selectionStart = el.selectionEnd = pos;
      });
      return;
    }

    // Auto-close brackets for JSON/GraphQL
    if ((language === 'json' || language === 'graphql') && ['{', '[', '"', "'"].includes(e.key) && start === end) {
      const pairs: Record<string, string> = { '{': '}', '[': ']', '"': '"', "'": "'" };
      const close = pairs[e.key];
      if (close) {
        // Don't auto-close if next char is already the closing char or is alphanumeric
        const nextChar = value.slice(end, end + 1);
        if (nextChar && /[a-zA-Z0-9"'`_\-]/.test(nextChar)) return;
        e.preventDefault();
        const before = value.slice(0, start);
        const after = value.slice(end);
        const next = before + e.key + close + after;
        onChange(next);
        requestAnimationFrame(() => {
          el.selectionStart = el.selectionEnd = start + 1;
        });
        return;
      }
    }

    // Forward to original handler if provided
    (props as any).onKeyDown?.(e);
  };

  const placeholder = (props as any).placeholder as string | undefined;
  const showPlaceholderOverlay = !value && !!placeholder;

  return (
    <div className="group relative flex h-full w-full flex-col overflow-hidden bg-[#0E0E10]">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        placeholder={placeholder}
        className={cn(
          'h-full w-full resize-none overflow-auto border-0 bg-[#0E0E10] p-3 font-mono text-[13px] leading-[20px] text-[#E6E8F0] placeholder:text-[#5A5E6E] caret-[#8B5CF6] outline-none selection:bg-[rgba(139,92,246,0.30)] selection:text-white',
          'tabular-nums',
          className
        )}
        style={{ tabSize, MozTabSize: tabSize } as any}
        {...props}
      />
      {/* Subtle placeholder overlay for richer styling when empty — kept hidden when value exists */}
      {showPlaceholderOverlay && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-3 top-3 select-none font-mono text-[13px] leading-[20px] text-[#5A5E6E] opacity-60"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
      )}
    </div>
  );
}
