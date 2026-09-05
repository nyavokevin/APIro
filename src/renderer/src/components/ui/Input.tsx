import React from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, type, style, ...props }: InputProps) {
  const isNumeric = type === 'number' || (props as any).inputMode === 'numeric';
  return (
    <label className="block">
      {label && (
        <span
          className="mb-1.5 block text-xs font-medium tracking-wide"
          style={{ color: '#9FA3B5', letterSpacing: '0.02em' }}
        >
          {label}
        </span>
      )}
      <input
        type={type}
        className={cn(
          'w-full border bg-[#0E0E10] px-3 text-sm placeholder:text-[#5A5E6E] outline-none transition-all duration-200 hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:bg-[#121215]',
          isNumeric && 'tabular-nums',
          className
        )}
        style={{
          height: '40px',
          borderRadius: '0px',
          borderColor: '#232329',
          color: '#E6E8F0',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#8B5CF6';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.10)';
          ;(props as any).onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#232329';
          e.currentTarget.style.boxShadow = 'none';
          ;(props as any).onBlur?.(e);
        }}
        {...props}
      />
    </label>
  );
}
