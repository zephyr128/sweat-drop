'use client';

import { memo, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/use-language';
import { Copy, Check, Smartphone, ExternalLink, AlertTriangle, Clock, UserX, Droplets } from 'lucide-react';
import Link from 'next/link';

const REFERRAL_CODE_STORAGE_KEY = 'sweatdrop-referral-code';
const REFERRAL_CODE_COOKIE_NAME = 'sd_ref';
const COOKIE_MAX_AGE_DAYS = 30;

interface ReferralPreview {
  status: 'valid' | 'expired' | 'used' | 'invalid';
  referrer_name: string | null;
  gym_name: string | null;
  gym_city: string | null;
  gym_logo_url: string | null;
  gym_primary_color: string | null;
  expires_at: string | null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function persistReferralCode(code: string) {
  try {
    localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, code);
  } catch {
    // localStorage unavailable
  }
  setCookie(REFERRAL_CODE_COOKIE_NAME, code, COOKIE_MAX_AGE_DAYS);
}

function formatInviteMessage(
  template: string,
  referrer: string | null,
  gym: string | null,
): string {
  let result = template;
  if (referrer) result = result.replace('{referrer}', referrer);
  if (gym) result = result.replace('{gym}', gym);
  return result;
}

export const JoinInvite = memo(function JoinInvite({ code }: { code: string }) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<ReferralPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const deepLink = `sweatdrop://join/${encodeURIComponent(code)}`;

  useEffect(() => {
    let cancelled = false;

    async function fetchPreview() {
      try {
        const res = await fetch(`/api/referral-preview/${encodeURIComponent(code)}`);
        if (!cancelled) {
          const data: ReferralPreview = await res.json();
          setPreview(data);

          if (data.status === 'valid') {
            persistReferralCode(code);
          }
        }
      } catch {
        if (!cancelled) {
          setPreview({
            status: 'invalid',
            referrer_name: null,
            gym_name: null,
            gym_city: null,
            gym_logo_url: null,
            gym_primary_color: null,
            expires_at: null,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPreview();
    return () => { cancelled = true; };
  }, [code]);

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code.toUpperCase());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }, [code]);

  const jp = t.joinPage;

  if (loading) {
    return <LoadingState message={jp.loading} />;
  }

  if (!preview || preview.status === 'invalid') {
    return <ErrorState icon={<AlertTriangle className="w-12 h-12 text-orange" />} title={jp.invalid.title} message={jp.invalid.message} />;
  }

  if (preview.status === 'expired') {
    return <ErrorState icon={<Clock className="w-12 h-12 text-orange" />} title={jp.expired.title} message={jp.expired.message} />;
  }

  if (preview.status === 'used') {
    return <ErrorState icon={<UserX className="w-12 h-12 text-orange" />} title={jp.used.title} message={jp.used.message} />;
  }

  const headline = preview.referrer_name && preview.gym_name
    ? formatInviteMessage(jp.inviteMessage, preview.referrer_name, preview.gym_name)
    : preview.gym_name
    ? formatInviteMessage(jp.inviteMessageNoReferrer, null, preview.gym_name)
    : jp.inviteMessageGeneric;

  const accentColor = preview.gym_primary_color || '#00E5FF';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 relative">
      {/* Background radial glow */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(ellipse at 50% 30%, ${accentColor}10 0%, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md flex flex-col items-center text-center"
      >
        {/* Gym Logo or SweatDrop branding */}
        <div className="mb-6">
          {preview.gym_logo_url ? (
            <img
              src={preview.gym_logo_url}
              alt={preview.gym_name || 'Gym'}
              className="w-20 h-20 rounded-2xl object-cover border border-border-medium"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center border border-border-medium"
              style={{ backgroundColor: `${accentColor}15` }}
            >
              <Droplets className="w-10 h-10" style={{ color: accentColor }} />
            </div>
          )}
        </div>

        {/* Gym name + city badge */}
        {preview.gym_name && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-4"
          >
            <span
              className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                backgroundColor: `${accentColor}15`,
                color: accentColor,
                border: `1px solid ${accentColor}30`,
              }}
            >
              {preview.gym_name}
              {preview.gym_city && ` · ${preview.gym_city}`}
            </span>
          </motion.div>
        )}

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-3xl sm:text-4xl text-text mb-3 leading-tight"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.02em' }}
        >
          {headline}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-text-2 text-base sm:text-lg mb-8 max-w-sm leading-relaxed"
        >
          {jp.subtitle}
        </motion.p>

        {/* Invite code card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
          className="glass-card w-full p-5 mb-8"
        >
          <div className="text-xs text-text-3 uppercase tracking-widest mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
            {jp.codeLabel}
          </div>
          <div className="flex items-center justify-between gap-3">
            <code
              className="text-xl sm:text-2xl font-bold tracking-[0.15em] text-text flex-1"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {code.toUpperCase()}
            </code>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all"
              style={{
                backgroundColor: copied ? `${accentColor}20` : 'rgba(255,255,255,0.08)',
                color: copied ? accentColor : '#86868B',
              }}
              aria-label="Copy invite code"
            >
              <AnimatePresence mode="wait">
                {copied ? (
                  <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1">
                    <Check className="w-4 h-4" /> {jp.codeCopied}
                  </motion.span>
                ) : (
                  <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1">
                    <Copy className="w-4 h-4" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </motion.div>

        {/* Open in App CTA (primary) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full mb-4"
        >
          <p className="text-sm text-text-2 mb-3">{jp.alreadyHaveApp}</p>
          <a
            href={deepLink}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl text-base font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              fontFamily: 'var(--font-body)',
              backgroundColor: accentColor,
              color: '#001a18',
            }}
          >
            <Smartphone className="w-5 h-5" />
            {jp.openInApp}
          </a>
        </motion.div>

        {/* Divider */}
        <div className="flex items-center gap-4 w-full mb-4">
          <div className="flex-1 h-px bg-border-subtle" />
          <span className="text-xs text-text-3 uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)' }}>
            {jp.orDownload}
          </span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>

        {/* Store buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="flex gap-3 w-full mb-6"
        >
          <a
            href="#"
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-border-medium bg-bg-card text-text text-sm font-semibold transition-all hover:bg-bg-card-hover hover:border-border-strong"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <AppleIcon />
            {jp.appStore}
          </a>
          <a
            href="#"
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-border-medium bg-bg-card text-text text-sm font-semibold transition-all hover:bg-bg-card-hover hover:border-border-strong"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            <PlayStoreIcon />
            {jp.googlePlay}
          </a>
        </motion.div>

        {/* After-install hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-xs text-text-3 leading-relaxed max-w-xs"
        >
          {jp.afterInstall}
        </motion.p>
      </motion.div>

      {/* Footer branding */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="relative z-10 mt-12"
      >
        <Link href="/" className="flex items-center gap-2 text-text-3 hover:text-text-2 transition-colors">
          <span className="text-sm" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
            {jp.poweredBy}
          </span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </motion.div>
    </div>
  );
});

function LoadingState({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full"
        />
        <p className="text-text-2 text-sm">{message}</p>
      </motion.div>
    </div>
  );
}

function ErrorState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center max-w-sm"
      >
        <div className="mb-6 p-4 rounded-2xl bg-orange/10">{icon}</div>
        <h1
          className="text-2xl sm:text-3xl text-text mb-3"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.02em' }}
        >
          {title}
        </h1>
        <p className="text-text-2 text-base mb-8 leading-relaxed">{message}</p>
        <Link
          href="/"
          className="text-sm text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
        >
          sweat-drop.com <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </motion.div>
    </div>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function PlayStoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302c.464.367.464 1.014 0 1.381l-2.302 1.414-2.536-2.536 2.536-2.561zM5.864 2.658l10.937 6.333-2.302 2.302-8.635-8.635z" />
    </svg>
  );
}
