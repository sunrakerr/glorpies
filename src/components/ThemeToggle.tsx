'use client';

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { writePref } from '@/lib/prefs';
import { DEFAULT_THEME, THEME_KEY, type Theme } from '@/lib/theme';

const root = () => document.documentElement;
const current = (): Theme => {
  const theme = root().dataset.theme;
  return theme === 'light' || theme === 'dark' ? theme : DEFAULT_THEME;
};
const apply = (t: Theme) => { root().dataset.theme = t; };

function subscribe(onChange: () => void) {
  const watch = new MutationObserver(onChange);
  watch.observe(root(), { attributes: true, attributeFilter: ['data-theme'] });
  return () => watch.disconnect();
}

/** Starts light and remembers an explicit choice of light or dark. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, current, () => DEFAULT_THEME);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  const pick = () => {
    apply(next);
    writePref(THEME_KEY, next);
  };

  return (
    <button
      type="button"
      onClick={pick}
      aria-label={`Switch to ${next} mode`}
      title={`${next} mode`}
      className={`grid size-7 place-items-center rounded-[4px] border border-ink/15 text-ink-2 transition hover:border-ink/40 hover:text-ink ${className}`}
    >
      {theme === 'dark' ? <Sun className="size-3.5" strokeWidth={1.8} /> : <Moon className="size-3.5" strokeWidth={1.8} />}
    </button>
  );
}
