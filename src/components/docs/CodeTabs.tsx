'use client';

import { useSyncExternalStore } from 'react';
import type { Lang } from '@/lib/highlight';
import { readPref, writePref } from '@/lib/prefs';
import { CodePanel } from '../Code';
import { Tabs } from '../Tabs';

export type Snippet = { code: string; lang: Lang; title: string; tab: string };

const KEY = 'glorpies:docs-tab';
const listeners = new Set<() => void>();
const subscribe = (listen: () => void) => {
  listeners.add(listen);
  return () => listeners.delete(listen);
};
const picked = () => readPref(KEY);
const pick = (tab: string) => {
  writePref(KEY, tab);
  listeners.forEach((listen) => listen());
};

/** Snippets under tabs. Picking a tab picks it in every group that has one, on this page and the next. */
export function CodeTabs({ snippets }: { snippets: Snippet[] }) {
  const choice = useSyncExternalStore(subscribe, picked, () => null);
  const tabs = snippets.map((s) => s.tab);
  const shown = snippets.find((s) => s.tab === choice) ?? snippets[0];
  if (!shown) return null;
  return (
    <CodePanel
      code={shown.code}
      lang={shown.lang}
      className="my-6"
      title={
        <div className="flex items-center gap-3">
          <div className="min-w-0 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&>div]:flex-nowrap">
            <Tabs options={tabs} value={shown.tab} onChange={pick} dark />
          </div>
          {shown.title !== shown.tab && (
            <span className="ml-auto hidden shrink-0 lg:inline">{shown.title}</span>
          )}
        </div>
      }
    />
  );
}
