'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  className?: string;
}

const variants = {
  hidden: {
    opacity: 0,
    y: 50,
    x: 0,
  },
  visible: {
    opacity: 1,
    y: 0,
    x: 0,
  },
};

export function ScrollReveal({
  children,
  delay = 0,
  direction = 'up',
  className,
}: ScrollRevealProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  const directionVariants = {
    up: { hidden: { ...variants.hidden, y: 50 }, visible: { ...variants.visible, y: 0 } },
    down: { hidden: { ...variants.hidden, y: -50 }, visible: { ...variants.visible, y: 0 } },
    left: { hidden: { ...variants.hidden, x: 50 }, visible: { ...variants.visible, x: 0 } },
    right: { hidden: { ...variants.hidden, x: -50 }, visible: { ...variants.visible, x: 0 } },
  };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={directionVariants[direction]}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
