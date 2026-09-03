import React from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-xs font-medium text-[#8F909E]">{label}</span>
      )}
      <input
        className={cn(
          'w-full border border-[#262626] bg-[#121212] px-3 text-sm text-[#E2E8F0] placeholder:text-[#8F909E] outline-none focus:border-[#8B5CF6]',
          className
        )}
        style={{ height: '40px', borderRadius: '0px' }}
        {...props}
      />
    </label>
  );
}
