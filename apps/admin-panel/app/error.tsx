'use client';

import { useEffect } from 'react';

// Note: Client Components cannot export route segment config
// error.tsx is always dynamic in Next.js App Router

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
        <p className="text-[#808080] mb-6">An unexpected error occurred. Please try again.</p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-[#00E5FF] text-black font-medium rounded-lg hover:bg-[#00B8CC] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
