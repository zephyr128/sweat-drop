'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SmartPlaceholderProps {
  icon?: LucideIcon;
  title?: string;
  gradient?: string;
  className?: string;
  children?: React.ReactNode;
}

export function SmartPlaceholder({
  icon: Icon,
  title,
  gradient = 'from-primary/20 via-primary/10 to-transparent',
  className,
  children,
}: SmartPlaceholderProps) {
  return (
    <div
      className={cn(
        'relative w-full h-full rounded-2xl overflow-hidden bg-gradient-to-br',
        gradient,
        className
      )}
    >
      {/* Backdrop blur effect */}
      <div className="absolute inset-0 bg-white/5 backdrop-blur-lg" />
      
      {/* Animated gradient overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5"
        animate={{
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-8">
        {Icon && (
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="mb-4"
          >
            <Icon className="w-16 h-16 text-primary/60" />
          </motion.div>
        )}
        {title && (
          <p className="text-sm font-medium text-white/40 uppercase tracking-wider">
            {title}
          </p>
        )}
        {children}
      </div>
      
      {/* Border glow */}
      <div className="absolute inset-0 rounded-2xl border border-white/10" />
    </div>
  );
}
