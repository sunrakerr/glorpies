'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

const LINKS = [
  { href: '/gallery', label: 'gallery' },
  { href: '/how', label: 'how' },
];

/** An 11 × 8 pixel invader, the site's mark. */
const INVADER = ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'];

export function Invader({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 11 8" shapeRendering="crispEdges" className={`fill-current ${className}`}>
      {INVADER.flatMap((row, y) => [...row].map((on, x) => (on === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null)))}
    </svg>
  );
}

/** The site's one header: the mark and name, home, the pages as paths (the current one lit), and the theme. */
export function SiteHeader({ className = '' }: { className?: string }) {
  const path = usePathname();
  return (
    <header className={`flex items-center justify-between gap-4 ${className}`}>
      <Link href="/" className="group flex items-center gap-2.5" aria-label="glorpies, home">
        <Invader className="h-[13px] text-accent transition group-hover:-translate-y-px" />
        <span className="font-display text-[18px] leading-none">glorpies</span>
      </Link>
      <nav className="flex items-center gap-4 text-[12.5px] text-ink-2">
        {LINKS.map((l) => {
          const here = path === l.href;
          return (
            <Link key={l.href} href={l.href} aria-current={here ? 'page' : undefined} className={`transition hover:text-ink ${here ? 'text-ink' : ''}`}>
              <span className={here ? 'text-accent' : 'text-ink-2/50'}>./</span>{l.label}
            </Link>
          );
        })}
        <ThemeToggle />
      </nav>
    </header>
  );
}
