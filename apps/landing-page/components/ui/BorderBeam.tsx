'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BorderBeamProps {
  className?: string;
  size?: number;
  duration?: number;
  borderWidth?: number;
  anchor?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
}

export function BorderBeam({
  className,
  size = 200,
  duration = 15,
  anchor = 90,
  borderWidth = 1.5,
  colorFrom = '#000000',
  colorTo = '#1a1a1a',
  delay = 0,
}: BorderBeamProps) {
  return (
    <div
      style={
        {
          '--size': size,
          '--duration': duration,
          '--anchor': anchor,
          '--border-width': borderWidth,
          '--color-from': colorFrom,
          '--color-to': colorTo,
        } as React.CSSProperties
      }
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit] [border:calc(var(--border-width)*1px)_solid_transparent]',
        // mask styles
        '[background:linear-gradient(transparent,transparent),padding-box,linear-gradient(to_right,var(--color-from),var(--color-to))] [background-clip:padding-box,border-box] [background-origin:border-box] [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)] [mask-composite:xor] [padding:var(--border-width)]',
        className
      )}
    >
      <motion.div
        className="absolute inset-0 rounded-[inherit] [background:conic-gradient(from_calc(270deg-(var(--anchor)*1deg)),transparent_0,var(--color-from)_var(--anchor),var(--color-to)_calc(var(--anchor)*2),transparent_0)] [background-size:200%_200%] opacity-40"
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%'],
        }}
        transition={{
          duration,
          repeat: Infinity,
          repeatType: 'reverse',
          ease: 'linear',
          delay,
        }}
      />
    </div>
  );
}
