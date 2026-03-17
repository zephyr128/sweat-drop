'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Trash2, Info } from 'lucide-react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

type Resolver = (value: boolean) => void;

let showFn: ((options: ConfirmOptions) => void) | null = null;
let resolver: Resolver | null = null;

/**
 * Imperative confirm dialog — call from any client component.
 * Returns a Promise<boolean> that resolves when the user responds.
 *
 * Usage:
 *   const ok = await confirmAction({ message: 'Delete this item?' });
 *   if (!ok) return;
 */
export function confirmAction(
  optionsOrMessage: ConfirmOptions | string
): Promise<boolean> {
  const options =
    typeof optionsOrMessage === 'string'
      ? { message: optionsOrMessage }
      : optionsOrMessage;

  return new Promise<boolean>((resolve) => {
    resolver = resolve;
    showFn?.(options);
  });
}

const variantConfig = {
  danger: {
    icon: Trash2,
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
    confirmBg: 'bg-red-500 hover:bg-red-600',
    confirmText: 'text-white',
    ring: 'focus-visible:ring-red-500',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-400',
    confirmBg: 'bg-amber-500 hover:bg-amber-600',
    confirmText: 'text-black',
    ring: 'focus-visible:ring-amber-500',
  },
  default: {
    icon: Info,
    iconBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-400',
    confirmBg: 'bg-[#00E5FF] hover:bg-[#00B8CC]',
    confirmText: 'text-black',
    ring: 'focus-visible:ring-cyan-500',
  },
};

export function ConfirmDialog() {
  const [state, setState] = useState<ConfirmOptions | null>(null);

  useEffect(() => {
    showFn = (options) => setState(options);
    return () => {
      showFn = null;
    };
  }, []);

  const close = useCallback((result: boolean) => {
    resolver?.(result);
    resolver = null;
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close]);

  if (!state) return null;

  const v = state.variant || 'default';
  const config = variantConfig[v];
  const Icon = config.icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => close(false)}
    >
      <div
        className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center`}
            >
              <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              {state.title && (
                <h3 className="text-base font-semibold text-white mb-1">
                  {state.title}
                </h3>
              )}
              <p className="text-sm text-zinc-400 leading-relaxed">
                {state.message}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 pb-5">
          <button
            onClick={() => close(false)}
            className="px-4 py-2 text-sm font-medium text-zinc-400 bg-[#1A1A1A] border border-[#333] rounded-lg hover:bg-[#222] hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            {state.cancelLabel || 'Cancel'}
          </button>
          <button
            autoFocus
            onClick={() => close(true)}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors focus:outline-none focus-visible:ring-2 ${config.confirmBg} ${config.confirmText} ${config.ring}`}
          >
            {state.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
