'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { readPref, writePref } from '@/lib/prefs';
import { THEME_KEY, type Theme } from '@/lib/theme';

const root = () => document.documentElement;
const current = (): Theme => (root().dataset.theme === 'dark' ? 'dark' : 'light');
const apply = (t: Theme) => { root().dataset.theme = t; };

function subscribe(onChange: () => void) {
  const watch = new MutationObserver(onChange);
  watch.observe(root(), { attributes: true, attributeFilter: ['data-theme'] });
  return () => watch.disconnect();
}

/** Light or dark. The page follows the system until one is picked, then remembers it. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, current, () => 'light' as Theme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  useEffect(() => {
    const system = matchMedia('(prefers-color-scheme: dark)');
    const follow = () => { if (!readPref(THEME_KEY)) apply(system.matches ? 'dark' : 'light'); };
    system.addEventListener('change', follow);
    return () => system.removeEventListener('change', follow);
  }, []);

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
