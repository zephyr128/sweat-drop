'use client';

import { memo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/use-language';

interface RequestDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormData {
  fullName: string;
  gymName: string;
  email: string;
  phone: string;
  locations: string;
  message: string;
}

interface FormErrors {
  fullName?: string;
  gymName?: string;
  email?: string;
}

export const RequestDemoModal = memo(function RequestDemoModal({ isOpen, onClose }: RequestDemoModalProps) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    gymName: '',
    email: '',
    phone: '',
    locations: '',
    message: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = t.requestDemo.errors.required;
    }

    if (!formData.gymName.trim()) {
      newErrors.gymName = t.requestDemo.errors.required;
    }

    if (!formData.email.trim()) {
      newErrors.email = t.requestDemo.errors.required;
    } else if (!validateEmail(formData.email)) {
      newErrors.email = t.requestDemo.errors.email;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/request-demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsSuccess(true);
        setFormData({
          fullName: '',
          gymName: '',
          email: '',
          phone: '',
          locations: '',
          message: '',
        });
        setErrors({});
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setIsSuccess(false);
      setFormData({
        fullName: '',
        gymName: '',
        email: '',
        phone: '',
        locations: '',
        message: '',
      });
      setErrors({});
      onClose();
    }
  };

  const locationOptions = [
    { value: '1', label: t.requestDemo.locations.one },
    { value: '2-5', label: t.requestDemo.locations.twoToFive },
    { value: '5+', label: t.requestDemo.locations.fivePlus },
  ];

  if (isSuccess) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title={t.requestDemo.title}>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xl text-white/90 mb-6">{t.requestDemo.success}</p>
          <Button onClick={handleClose} variant="primary" className="w-full">
            {t.requestDemo.close}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t.requestDemo.title}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label={t.requestDemo.fields.fullName}
          value={formData.fullName}
          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
          error={errors.fullName}
          required
          disabled={isSubmitting}
        />

        <Input
          label={t.requestDemo.fields.gymName}
          value={formData.gymName}
          onChange={(e) => setFormData({ ...formData, gymName: e.target.value })}
          error={errors.gymName}
          required
          disabled={isSubmitting}
        />

        <Input
          label={t.requestDemo.fields.email}
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          error={errors.email}
          required
          disabled={isSubmitting}
        />

        <Input
          label={t.requestDemo.fields.phone}
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          disabled={isSubmitting}
        />

        <Select
          label={t.requestDemo.fields.locations}
          value={formData.locations}
          onChange={(e) => setFormData({ ...formData, locations: e.target.value })}
          options={locationOptions}
          disabled={isSubmitting}
        />

        <Textarea
          label={t.requestDemo.fields.message}
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          disabled={isSubmitting}
        />

        <div className="flex gap-4 pt-4">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isSubmitting} className="flex-1">
            {t.requestDemo.cancel}
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting} className="flex-1">
            {t.requestDemo.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
});
