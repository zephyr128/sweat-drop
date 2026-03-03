'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration' | 'onDrag' | 'onDragStart' | 'onDragEnd'> {
  variant?: 'primary' | 'secondary' | 'outline-teal' | 'orange' | 'large' | 'small';
  isLoading?: boolean;
  children: React.ReactNode;
}

export const Button = memo(function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  className,
  children,
  type,
  onClick,
  ...restProps
}: ButtonProps) {
  const baseStyles = 'font-sans flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden border-none';

  const variantStyles = {
    primary: cn(
      'bg-accent text-[#001a18] font-semibold text-[15px] px-6 py-3 rounded-lg',
      'hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)]',
      'active:scale-[0.98]',
      'tracking-[-0.01em]'
    ),
    secondary: cn(
      'bg-[rgba(255,255,255,0.06)] text-text font-medium text-[15px] px-6 py-3 rounded-lg',
      'border border-[rgba(255,255,255,0.10)] backdrop-blur-[10px]',
      'hover:bg-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.15)]',
      'active:scale-[0.98]'
    ),
    'outline-teal': cn(
      'bg-transparent text-accent border border-[rgba(0,229,204,0.30)] rounded-lg px-6 py-3',
      'font-medium text-[15px]',
      'hover:bg-[rgba(0,229,204,0.08)] hover:border-[rgba(0,229,204,0.50)]',
      'active:scale-[0.98]'
    ),
    orange: cn(
      'bg-orange text-white rounded-lg px-6 py-3 font-semibold text-[15px]',
      'hover:bg-[#ff6620] hover:shadow-[0_0_30px_rgba(255,85,0,0.25)]',
      'active:scale-[0.98]'
    ),
    large: cn(
      'bg-accent text-[#001a18] font-semibold text-[17px] px-8 py-4 rounded-lg',
      'hover:bg-[#00f0d6] hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,229,204,0.25)]',
      'active:scale-[0.98]',
      'tracking-[-0.01em]'
    ),
    small: cn(
      'bg-accent text-[#001a18] font-semibold text-[13px] px-4 py-2.5 rounded-lg',
      'hover:bg-[#00f0d6] hover:scale-[1.02]',
      'active:scale-[0.98]'
    ),
  };

  return (
    <motion.button
      whileHover={!disabled && !isLoading ? {} : {}}
      whileTap={!disabled && !isLoading ? {} : {}}
      disabled={disabled || isLoading}
      className={cn(baseStyles, variantStyles[variant], className)}
      type={type}
      onClick={onClick}
      {...restProps}
    >
      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
});
