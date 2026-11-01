'use client';

import { ArrowUpRight, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DOC_PAGES, DOCS, docHref } from '@/lib/docs';
import { REPO_URL } from '@/lib/site';

function Index({ onPick }: { onPick?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Docs" className="space-y-6 text-[12.5px]">
      {DOCS.map((g) => (
        <div key={g.group}>
          <p className="mb-2 text-[11px] text-ink-2/60">{g.group}</p>
          <ul className="space-y-0.5">
            {g.pages.map((p) => {
              const href = docHref(p.slug);
              const here = path === href;
              return (
                <li key={p.slug}>
                  <Link
                    href={href}
                    onClick={onPick}
                    aria-current={here ? 'page' : undefined}
                    className={`block rounded-[3px] py-1 transition ${here ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}
                  >
                    <span className={here ? 'text-accent' : 'text-ink-2/40'}>./</span>
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 py-1 text-ink-2 transition hover:text-ink">
        source on github <ArrowUpRight aria-hidden className="size-3 text-ink-2/50" strokeWidth={1.8} />
      </a>
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:block">
      <div className="sticky top-8 max-h-[calc(100dvh-4rem)] overflow-y-auto pb-8 [scrollbar-width:none]">
        <Index />
      </div>
    </aside>
  );
}

export function MobileIndex() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const page = DOC_PAGES.find((p) => docHref(p.slug) === path);
  return (
    <div className="mb-8 rounded-lg border border-ink/12 md:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-[12.5px]">
        <span>
          <span className="text-ink-2">docs / </span>
          {page?.title}
        </span>
        <ChevronDown className={`size-4 text-ink-2 transition ${open ? 'rotate-180' : ''}`} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="border-t border-ink/10 px-4 py-4">
          <Index onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export function PrevNext() {
  const path = usePathname();
  const at = DOC_PAGES.findIndex((p) => docHref(p.slug) === path);
  const pages = [
    { page: DOC_PAGES[at - 1], label: 'previous', align: '' },
    { page: DOC_PAGES[at + 1], label: 'next', align: 'sm:col-start-2 sm:text-right' },
  ];
  return (
    <nav aria-label="Previous and next" className="mt-20 grid gap-4 sm:grid-cols-2">
      {pages.map(({ page, label, align }) =>
        page ? (
          <Link key={label} href={docHref(page.slug)} className={`group rounded-lg border border-ink/12 px-5 py-4 transition hover:border-accent ${align}`}>
            <span className="block text-[11.5px] text-ink-2/70">{label === 'next' ? 'next →' : '← previous'}</span>
            <span className="mt-1 block font-display text-[16px] text-ink transition group-hover:text-accent">{page.title}</span>
            <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{page.summary}</span>
          </Link>
        ) : null,
      )}
    </nav>
  );
}

type Entry = { id: string; text: string; depth: number };

/** The page's own headings, with the one being read lit. */
export function Outline() {
  const path = usePathname();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    const headings = [...document.querySelectorAll<HTMLElement>('[data-doc] h2[id], [data-doc] h3[id]')];
    setEntries(headings.map((h) => ({ id: h.id, text: h.textContent ?? '', depth: h.tagName === 'H3' ? 1 : 0 })));
    setActive(headings[0]?.id ?? '');
    const seen = new IntersectionObserver(
      (records) => {
        const top = records.filter((r) => r.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    headings.forEach((h) => seen.observe(h));
    return () => seen.disconnect();
  }, [path]);

  if (entries.length < 2) return <aside className="hidden xl:block" />;
  return (
    <aside className="hidden xl:block">
      <nav aria-label="On this page" className="sticky top-8 text-[11.5px]">
        <p className="mb-3 text-[11px] text-ink-2/60">on this page</p>
        <ul className="space-y-1.5 border-l border-ink/10">
          {entries.map((e) => (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                className={`-ml-px block border-l py-0.5 transition ${e.depth ? 'pl-6' : 'pl-3'} ${active === e.id ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
              >
                {e.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
