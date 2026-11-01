'use client';

import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';

export function IconButton({ label, children, className = '', ...rest }: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`group/btn relative grid size-9 place-items-center rounded-full text-ink/75 transition duration-200 hover:bg-ink/[0.07] hover:text-ink active:scale-95 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
      <span
        role="tooltip"
        // left out of the layout until it shows, so near the edge of a phone it can't widen the page
        className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-paper shadow-pill transition-[opacity,translate,display] transition-discrete duration-200 starting:translate-y-1 starting:opacity-0 group-focus-visible/btn:block [@media(hover:hover)]:group-hover/btn:block"
      >
        {label}
      </span>
    </button>
  );
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 rounded-full border border-ink/10 bg-paper/90 p-1 shadow-pill backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

export function TextButton({ children, tone = 'plain', className = '', ...rest }: ComponentProps<'button'> & { tone?: 'plain' | 'ink' }) {
  const look =
    tone === 'ink'
      ? 'bg-ink text-paper hover:bg-ink/90 shadow-pill'
      : 'border border-ink/12 bg-paper/70 text-ink hover:border-ink/25 hover:bg-paper';
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition duration-200 active:scale-[0.98] disabled:opacity-50 ${look} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

type Toast = { id: number; text: string; tone: 'busy' | 'ok' | 'error' };

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);
  const show = useCallback((text: string, tone: Toast['tone']) => {
    clearTimeout(timer.current);
    const id = ++seq.current;
    setToast({ id, text, tone });
    if (tone !== 'busy') timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), tone === 'error' ? 4200 : 2200);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, show };
}

export function ToastView({ toast }: { toast: Toast | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      {toast && (
        <div key={toast.id} className="toast-in flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] text-paper shadow-pill">
          {toast.tone === 'busy' && <LoaderCircle className="size-4 animate-spin opacity-80" />}
          {toast.tone === 'ok' && <Check className="size-4 text-[#9fd3b5]" />}
          {toast.tone === 'error' && <CircleAlert className="size-4 text-[#f0a58f]" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
