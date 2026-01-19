'use client';

import { ToasterProvider } from '@/components/ToasterProvider';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ToasterProvider />
      {children}
    </>
  );
}
