'use client';

import { memo } from 'react';
import Image from 'next/image';
import { LanguageSelector } from './LanguageSelector';
import { motion } from 'framer-motion';

export const Navigation = memo(function Navigation() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/10"
      aria-label="Main navigation"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Image
              src="/appicon.png"
              alt="SweatDrop Logo"
              width={24}
              height={24}
              className="w-6 h-6"
              priority
            />
            <span className="text-xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              SweatDrop
            </span>
          </div>

          {/* Language Selector */}
          <LanguageSelector />
        </div>
      </div>
    </motion.nav>
  );
});
