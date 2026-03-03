'use client';

import { memo, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModal } from '@/lib/modal-context';
import { useLanguage } from '@/lib/use-language';
import { LanguageSelector } from './LanguageSelector';

export const Navigation = memo(function Navigation() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { openModal } = useModal();
  const { t } = useLanguage();
  const [currentHash, setCurrentHash] = useState<string>('');

  const navLinks = [
    { href: '/', label: t.navigation.forGyms, key: 'forGyms' },
    { href: '/#pricing', label: t.navigation.pricing, key: 'pricing' },
    { href: '/sweat-arenas', label: t.navigation.sweatArenas, key: 'sweatArenas' },
    { href: '/members', label: t.navigation.forMembers, key: 'forMembers' },
    { href: '/sponsors', label: t.navigation.forSponsors, key: 'forSponsors' },
  ];

  // Listen for hash changes
  useEffect(() => {
    const updateHash = () => {
      setCurrentHash(window.location.hash);
    };

    // Set initial hash
    updateHash();

    // Listen for hash changes
    window.addEventListener('hashchange', updateHash);
    
    // Also check on pathname change (for Next.js navigation)
    const interval = setInterval(updateHash, 100);

    return () => {
      window.removeEventListener('hashchange', updateHash);
      clearInterval(interval);
    };
  }, [pathname]);

  const isActive = (href: string, key: string) => {
    const isHomepage = pathname === '/';
    
    // "For Gyms" is active when:
    // - On homepage with no hash, OR
    // - On homepage with #pricing hash (because pricing is a subsection)
    if (key === 'forGyms') {
      return isHomepage;
    }
    
    // "Pricing" is active when on homepage with #pricing hash
    if (key === 'pricing') {
      return isHomepage && currentHash === '#pricing';
    }
    
    // For hash links, check if hash matches
    if (href.startsWith('/#')) {
      return isHomepage && currentHash === href.substring(1);
    }
    
    // For other paths, check if pathname matches
    return pathname?.startsWith(href);
  };

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-[100]"
        style={{
          height: '52px',
          padding: '0 24px',
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '0.5px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="container mx-auto h-full flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="display text-2xl tracking-[3px] text-accent no-underline hover:opacity-80 transition-opacity"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            SWEATDROP
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`font-sans text-[13px] font-normal no-underline transition-colors ${
                  isActive(link.href, link.key) 
                    ? 'text-white' 
                    : 'text-[rgba(255,255,255,0.8)] hover:text-white'
                }`}
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right: Language + CTA */}
          <div className="hidden md:flex items-center gap-4">
            <LanguageSelector />
            <button
              onClick={() => openModal('apply-pilot')}
              className="font-sans text-[13px] font-semibold bg-accent text-[#001a18] px-4 py-2.5 rounded-lg hover:bg-[#00f0d6] transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t.navigation.applyForPilot}
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="md:hidden p-2 text-text-2 hover:text-text transition-colors"
            aria-label="Toggle menu"
            aria-expanded={isMobileOpen}
          >
            {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-border bg-bg"
            >
              <div className="container mx-auto px-6 py-4 space-y-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={`block text-base font-medium transition-colors ${
                      isActive(link.href, link.key)
                        ? 'text-accent border-l-4 border-accent pl-3'
                        : 'text-text-2 hover:text-text'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="pt-4 border-t border-border space-y-3">
                  <button
                    onClick={() => {
                      openModal('apply-pilot');
                      setIsMobileOpen(false);
                    }}
                    className="w-full font-sans text-[15px] font-semibold bg-accent text-[#001a18] px-6 py-3 rounded-lg hover:bg-[#00f0d6] transition-colors"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {t.navigation.applyForPilot}
                  </button>
                  <LanguageSelector />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </>
  );
});
