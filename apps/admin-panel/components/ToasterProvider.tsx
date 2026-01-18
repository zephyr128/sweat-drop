'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

export function ToasterProvider() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Only render Toaster on client side to prevent build-time errors
  if (!mounted) {
    return null;
  }

  return <Toaster position="top-right" theme="dark" />;
}
