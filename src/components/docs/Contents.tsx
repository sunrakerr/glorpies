import Link from 'next/link';
import { DOCS, docHref } from '@/lib/docs';

/** Every docs page after this one, grouped, with what each is for. */
export function Contents() {
  return (
    <div className="my-8 grid gap-x-8 gap-y-8 sm:grid-cols-2">
      {DOCS.map((g) => (
        <div key={g.group}>
          <p className="mb-2 text-[11px] text-ink-2/60">{g.group}</p>
          <ul className="divide-y divide-ink/8 border-y border-ink/8">
            {g.pages.filter((p) => p.slug).map((p) => (
              <li key={p.slug} className="list-none">
                <Link href={docHref(p.slug)} className="group flex items-baseline justify-between gap-4 py-2.5 text-[12.5px]">
                  <span className="text-ink transition group-hover:text-accent">
                    <span className="text-ink-2/40">./</span>
                    {p.title}
                  </span>
                  <span className="text-right text-[11.5px] text-ink-2">{p.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
