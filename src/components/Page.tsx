import Link from 'next/link';
import type { ReactNode } from 'react';
import { PixelField } from './landing/PixelField';
import { Invader, SiteHeader } from './SiteHeader';

/** Every page's frame: the pixel field, one column under the header, and the footer. */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <PixelField />
      <div className="relative mx-auto flex w-full max-w-[1120px] flex-1 flex-col px-6">
        <SiteHeader className="pt-8" />
        <main className={`flex-1 ${className}`}>{children}</main>
        <Footer />
      </div>
    </div>
  );
}

/** A section's heading: its alien letter, its name and a dashed rule, with anything else (a count, a hint) at the end. */
export function Heading({ id, title, mark, aside, as: Tag = 'h2' }: { id?: string; title: string; mark: string; aside?: ReactNode; as?: 'h1' | 'h2' }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span aria-hidden className="font-alien text-[19px] leading-none text-accent">{mark}</span>
      <Tag id={id} className="scroll-mt-8 font-display text-[15px] leading-none">{title}</Tag>
      <span aria-hidden className="h-px flex-1 bg-[repeating-linear-gradient(90deg,currentColor_0_4px,transparent_4px_8px)] text-ink/20" />
      {aside && <span className="text-[11.5px] text-ink-2">{aside}</span>}
    </div>
  );
}

/** A titled section of a page. */
export function Section({ title, mark, id, aside, className = '', children }: { title: string; mark: string; id?: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${title}-title`} className={`scroll-mt-8 ${className}`}>
      <Heading id={`${title}-title`} title={title} mark={mark} aside={aside} />
      {children}
    </section>
  );
}

/** The mark, the licence, who made it and the other pages, under a dashed rule like the sections'. */
export function Footer() {
  return (
    <footer className="mb-10 mt-14 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-dashed border-ink/20 pt-5 text-[11.5px] text-ink-2">
      <span className="flex items-center gap-2">
        <Invader className="h-[10px] text-accent" />
        <span className="text-ink">glorpies</span> · mit licence · made by{' '}
        <a href="https://github.com/sunrakerr" target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-ink/30 underline-offset-[3px] transition hover:text-accent hover:decoration-accent">
          sunrakerr
        </a>
      </span>
      <nav className="flex items-center gap-4">
        <Link href="/" className="transition hover:text-ink">./</Link>
        <Link href="/docs" className="transition hover:text-ink">./docs</Link>
        <Link href="/gallery" className="transition hover:text-ink">./gallery</Link>
        <Link href="/how" className="transition hover:text-ink">./how</Link>
      </nav>
    </footer>
  );
}
