import React from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs text-[var(--text-secondary)]">{label}</span>
      )}
      <input
        className={cn(
          'w-full rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]',
          className
        )}
        {...props}
      />
    </label>
  );
}
