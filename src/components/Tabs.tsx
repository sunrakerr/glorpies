'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Choices as a row of words, the chosen one highlighted like a selected item in a terminal menu.
 * `scroll` keeps them on one line, scrolling sideways where they don't fit, with the cut-off side faded.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  dark = false,
  scroll = false,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  dark?: boolean;
  scroll?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const row = ref.current;
    if (!scroll || !row) return;
    const measure = () =>
      setMore({
        left: row.scrollLeft > 1,
        right: row.scrollLeft + row.clientWidth < row.scrollWidth - 1,
      });
    measure();
    const sized = new ResizeObserver(measure);
    sized.observe(row);
    row.addEventListener('scroll', measure, { passive: true });
    return () => {
      sized.disconnect();
      row.removeEventListener('scroll', measure);
    };
  }, [scroll]);

  // the chosen one is brought into view sideways only; scrollIntoView would move the page too
  useEffect(() => {
    const row = ref.current;
    const on = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!scroll || !row || !on) return;
    const left = on.offsetLeft - row.offsetLeft,
      right = left + on.offsetWidth;
    if (left < row.scrollLeft) row.scrollTo({ left: left - 24, behavior: 'smooth' });
    else if (right > row.scrollLeft + row.clientWidth)
      row.scrollTo({ left: right - row.clientWidth + 24, behavior: 'smooth' });
  }, [scroll, value]);

  const fade = `linear-gradient(to right, ${more.left ? 'transparent' : 'black'}, black 1.5rem, black calc(100% - 1.5rem), ${more.right ? 'transparent' : 'black'})`;
  return (
    <div
      ref={ref}
      role="tablist"
      className={
        scroll
          ? 'flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'flex flex-wrap gap-1'
      }
      style={scroll ? { maskImage: fade, WebkitMaskImage: fade } : undefined}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="tab"
          aria-selected={o === value}
          onClick={() => onChange(o)}
          className="shrink-0"
        >
          <Pick on={o === value} dark={dark}>
            {o}
          </Pick>
        </button>
      ))}
    </div>
  );
}

/** A word that lights up when it's the chosen one. `dark` is for words on the terminal. */
export function Pick({
  on,
  dark = false,
  children,
}: {
  on: boolean;
  dark?: boolean;
  children: ReactNode;
}) {
  const tone = dark
    ? on
      ? 'bg-term-fg/[0.12] text-term-fg'
      : 'text-term-fg/50 hover:text-term-fg'
    : on
      ? 'bg-ink text-paper'
      : 'text-ink-2 hover:bg-ink/[0.06] hover:text-ink';
  return (
    <span
      className={`inline-block rounded-[3px] px-1.5 py-0.5 text-[12.5px] leading-none transition ${tone}`}
    >
      {children}
    </span>
  );
}
