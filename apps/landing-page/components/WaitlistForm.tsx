'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useLanguage } from '@/lib/use-language';

interface WaitlistFormProps {
  source?: 'members_page' | 'homepage' | 'organic';
}

export const WaitlistForm = memo(function WaitlistForm({ source = 'organic' }: WaitlistFormProps) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, source }),
      });

      if (response.ok) {
        setIsSuccess(true);
        setEmail('');
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      console.error('Error submitting waitlist:', error);
      alert(t.waitlistForm.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card p-6 border-accent/30"
      >
        <div className="flex items-center gap-3 text-accent">
          <Check className="w-5 h-5" />
          <span className="font-medium">{t.waitlistForm.success}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t.waitlistForm.placeholder}
        required
        disabled={isSubmitting}
        className="flex-1 px-4 py-3 bg-bg-card border border-border rounded-lg text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all mono text-sm"
        style={{ fontFamily: 'var(--font-mono)' }}
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="display text-lg bg-accent text-[#001a18] px-6 py-3 rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {isSubmitting ? t.waitlistForm.joining : t.waitlistForm.join}
      </button>
    </form>
  );
});
