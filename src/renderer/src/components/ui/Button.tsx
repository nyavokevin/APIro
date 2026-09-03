import React from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary: 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] border border-transparent',
  secondary: 'bg-[#1A1A1A] text-[#E2E8F0] border border-[#262626] hover:bg-[#262626] hover:border-[#404040]',
  ghost: 'text-[#8F909E] hover:text-[#E2E8F0] hover:bg-[#1A1A1A] border border-transparent',
  danger: 'bg-[#EF4444] text-white hover:opacity-90 border border-transparent',
};

const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-2 text-sm',
};

export function Button({ variant = 'secondary', size = 'md', className, type = 'button' as const, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 disabled:opacity-50',
        'rounded-none border',
        variants[variant],
        sizes[size],
        className
      )}
      style={{ borderRadius: '0px' }}
      {...props}
    />
  );
}
