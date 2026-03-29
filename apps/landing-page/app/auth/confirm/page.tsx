'use client';

import { useEffect, useState } from 'react';

export default function EmailConfirmPage() {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = 'sweatdrop://';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleOpenApp = () => {
    window.location.href = 'sweatdrop://';
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-cyan-500/20 flex items-center justify-center mb-8">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-10 h-10 text-cyan-400"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Title */}
        <h1
          className="text-3xl tracking-wider text-white mb-3"
          style={{ fontFamily: 'var(--font-display), sans-serif' }}
        >
          EMAIL CONFIRMED
        </h1>

        <p className="text-gray-400 text-base leading-relaxed mb-8">
          Your email has been verified successfully.
          <br />
          You can now continue in the SweatDrop app.
        </p>

        {/* CTA */}
        <button
          onClick={handleOpenApp}
          className="w-full py-4 rounded-full bg-cyan-400 text-black font-bold text-lg tracking-wide uppercase transition-all hover:bg-cyan-300 hover:shadow-[0_0_30px_rgba(0,229,255,0.4)] active:scale-[0.98]"
          style={{ fontFamily: 'var(--font-display), sans-serif' }}
        >
          OPEN SWEATDROP
        </button>

        <p className="text-gray-500 text-sm mt-4">
          Redirecting automatically in {countdown}s...
        </p>

        {/* Subtle footer */}
        <p className="text-gray-600 text-xs mt-12">
          If the app doesn&apos;t open, make sure SweatDrop is installed on your device.
        </p>
      </div>
    </div>
  );
}
