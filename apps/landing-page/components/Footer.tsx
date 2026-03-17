'use client';

import { memo } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/use-language';

export const Footer = memo(function Footer() {
  const { t, language } = useLanguage();

  const footerLinks = [
    { href: '/#pricing', label: t.footer.forGyms },
    { href: '/sweat-arenas', label: t.footer.sweatArenas },
    { href: '/members', label: t.footer.forMembers },
    { href: '/sponsors', label: t.footer.forSponsors },
    { href: `/privacy?lang=${language}`, label: t.footer.privacy },
    { href: `/terms?lang=${language}`, label: t.footer.terms },
  ];

  return (
    <footer className="bg-bg border-t border-border py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left: Logo + Tagline */}
          <div>
            <div className="display text-2xl tracking-[3px] text-accent mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              SWEATDROP
            </div>
            <p className="text-sm text-text-2">
              {t.footer.tagline}
            </p>
          </div>

          {/* Center: Links */}
          <div>
            <nav className="flex flex-wrap gap-4 justify-center md:justify-start">
              {footerLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-text-2 hover:text-text transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right: Language + Copyright */}
          <div className="flex flex-col items-center md:items-end gap-4">
            <div className="flex items-center gap-2 text-sm text-text-2">
              <button className="hover:text-text transition-colors">EN</button>
              <span className="text-border">|</span>
              <button className="hover:text-text transition-colors">SR</button>
            </div>
            <p className="text-xs text-text-3 mono">
              {t.footer.copyright}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
});
