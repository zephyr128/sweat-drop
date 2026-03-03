'use client';

import { memo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/use-language';

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  source?: 'members_page' | 'homepage' | 'organic';
}

export const WaitlistModal = memo(function WaitlistModal({
  isOpen,
  onClose,
  source = 'organic',
}: WaitlistModalProps) {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [gymName, setGymName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, gym_name: gymName, source }),
      });

      if (response.ok) {
        setIsSuccess(true);
        setEmail('');
        setGymName('');
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      console.error('Error submitting waitlist:', error);
      alert(t.waitlist.errorGeneric);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={t.waitlist.successTitle}>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg text-text mb-6">
            {t.waitlist.successMessage}
          </p>
          <Button onClick={onClose} variant="primary" className="w-full">
            {t.waitlist.close}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.waitlist.title} className="max-w-[440px]">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label={t.waitlist.fields.email}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isSubmitting}
          placeholder={t.waitlist.placeholders.email}
        />
        <Input
          label={t.waitlist.fields.gymName}
          value={gymName}
          onChange={(e) => setGymName(e.target.value)}
          disabled={isSubmitting}
          placeholder={t.waitlist.placeholders.gymName}
        />
        <Button type="submit" variant="primary" isLoading={isSubmitting} className="w-full">
          {t.waitlist.submit}
        </Button>
      </form>
    </Modal>
  );
});
