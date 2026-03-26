'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open, close]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="More info"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2.5 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] shadow-xl shadow-black/40 text-xs text-zinc-300 leading-relaxed pointer-events-auto animate-in fade-in duration-150">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-[#2A2A2A]" />
        </div>
      )}
    </div>
  );
}
