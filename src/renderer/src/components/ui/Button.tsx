import React from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary: 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] border border-transparent shadow-[0_0_12px_rgba(139,92,246,0.22)] hover:shadow-[0_0_16px_rgba(139,92,246,0.32)] active:scale-[0.98]',
  secondary: 'bg-[#18181B] text-[#E6E8F0] border border-[#232329] hover:bg-[#1E1E24] hover:border-[#2E2E36] hover:text-white active:scale-[0.98]',
  ghost: 'text-[#7A7F93] hover:text-[#E6E8F0] hover:bg-[#121215] border border-transparent active:scale-[0.98]',
  danger: 'bg-[#EF4444] text-white hover:bg-[#DC2626] border border-transparent shadow-[0_0_10px_rgba(239,68,68,0.22)] active:scale-[0.98]',
};

const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-2 text-sm',
};

export function Button({ variant = 'secondary', size = 'md', className, type = 'button' as const, style, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:opacity-50 disabled:cursor-not-allowed',
        'rounded-none border tracking-[-0.01em]',
        variants[variant],
        sizes[size],
        className
      )}
      style={{ borderRadius: '0px', ...style }}
      {...props}
    />
  );
}
