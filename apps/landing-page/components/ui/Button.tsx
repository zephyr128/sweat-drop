'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
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
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  id,
  name,
  value,
  form,
  formAction,
  formEncType,
  formMethod,
  formNoValidate,
  formTarget,
  autoFocus,
  tabIndex,
  accessKey,
  ...restProps
}: ButtonProps) {
  const baseStyles =
    'px-8 py-4 font-bold rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden';

  const variantStyles = {
    primary:
      'bg-gradient-to-r from-primary to-primary-light text-background hover:shadow-[0_0_30px_rgba(0,229,255,0.5)]',
    secondary: 'border-2 border-white/20 text-white hover:bg-white/5',
  };

  // Explicitly pass only safe props to motion.button
  const safeProps = {
    type,
    onClick,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    id,
    name,
    value,
    form,
    formAction,
    formEncType,
    formMethod,
    formNoValidate,
    formTarget,
    autoFocus,
    tabIndex,
    accessKey,
  };

  // Remove undefined values
  const cleanedProps = Object.fromEntries(
    Object.entries(safeProps).filter(([_, value]) => value !== undefined)
  );

  return (
    <motion.button
      whileHover={!disabled && !isLoading ? { scale: 1.02 } : {}}
      whileTap={!disabled && !isLoading ? { scale: 0.98 } : {}}
      disabled={disabled || isLoading}
      className={cn(baseStyles, variantStyles[variant], className)}
      {...cleanedProps}
    >
      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
});
