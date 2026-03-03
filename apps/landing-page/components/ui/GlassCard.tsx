'use client';

import { memo, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: ReactNode;
  variant?: 'default' | 'teal' | 'orange' | 'lime' | 'pricing' | 'featured';
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  as?: 'div' | 'section' | 'article';
}

const variantClasses = {
  default: 'glass-card',
  teal: 'glass-card-teal',
  orange: 'glass-card-orange',
  lime: 'glass-card-lime',
  pricing: 'glass-card-pricing',
  featured: 'glass-card-featured',
};

export const GlassCard = memo(function GlassCard({
  children,
  variant = 'default',
  className,
  hover = true,
  onClick,
  as: Component = 'div',
}: GlassCardProps) {
  const baseClasses = variantClasses[variant];
  const hoverClass = hover ? 'hover:glass-card' : '';

  if (onClick) {
    return (
      <motion.button
        onClick={onClick}
        className={cn(baseClasses, hoverClass, className)}
        whileHover={hover ? { y: -2 } : undefined}
        whileTap={{ scale: 0.98 }}
      >
        {children}
      </motion.button>
    );
  }

  return (
    <Component className={cn(baseClasses, hoverClass, className)}>
      {children}
    </Component>
  );
});
