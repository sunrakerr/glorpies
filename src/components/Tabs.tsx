'use client';

import type { ReactNode } from 'react';

/** Choices as a row of words, the chosen one highlighted like a selected item in a terminal menu. */
export function Tabs<T extends string>({ options, value, onChange, dark = false }: { options: readonly T[]; value: T; onChange: (v: T) => void; dark?: boolean }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={o} type="button" role="tab" aria-selected={o === value} onClick={() => onChange(o)}>
          <Pick on={o === value} dark={dark}>{o}</Pick>
        </button>
      ))}
    </div>
  );
}

/** A word that lights up when it's the chosen one. `dark` is for words on the terminal. */
export function Pick({ on, dark = false, children }: { on: boolean; dark?: boolean; children: ReactNode }) {
  const tone = dark
    ? on ? 'bg-term-fg/[0.12] text-term-fg' : 'text-term-fg/50 hover:text-term-fg'
    : on ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-ink/[0.06] hover:text-ink';
  return <span className={`inline-block rounded-[3px] px-1.5 py-0.5 text-[12.5px] leading-none transition ${tone}`}>{children}</span>;
}
