'use client';

import { memo, useState, useCallback } from 'react';
import { Globe } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';
import { languages } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';

export const LanguageSelector = memo(function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const handleLanguageChange = useCallback(
    (langCode: typeof language) => {
      setLanguage(langCode);
      setIsOpen(false);
    },
    [setLanguage]
  );

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <div className="relative">
      <button
        onClick={toggleOpen}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surfaceElevated hover:bg-surfaceElevated/80 transition-colors border border-white/10"
        aria-label="Select language"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Globe className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm font-medium">{languages.find((l) => l.code === language)?.name}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={closeMenu}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full mt-2 right-0 z-50 bg-surfaceElevated border border-white/10 rounded-lg overflow-hidden min-w-[120px]"
              role="menu"
            >
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-white/5 transition-colors ${
                    language === lang.code ? 'bg-white/10' : ''
                  }`}
                  role="menuitem"
                  aria-selected={language === lang.code}
                >
                  {lang.name}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});
