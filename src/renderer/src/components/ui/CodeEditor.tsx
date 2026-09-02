import { type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface CodeEditorProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

export function CodeEditor({ value, onChange, className, ...props }: CodeEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      className={cn(
        'h-full w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]',
        className
      )}
      {...props}
    />
  );
}
