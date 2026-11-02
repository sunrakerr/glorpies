import Link from 'next/link';
import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { DOC_PAGES, DOCS, docHref } from '@/lib/docs';
import type { Lang } from '@/lib/highlight';
import { CodePanel } from '../Code';
import { CodeTabs, type Snippet } from './CodeTabs';

const textOf = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
};

const slug = (node: ReactNode) =>
  textOf(node)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const LANGS: Record<string, Lang> = {
  tsx: 'tsx',
  jsx: 'tsx',
  ts: 'ts',
  js: 'ts',
  json: 'ts',
  html: 'html',
  vue: 'html',
  svelte: 'html',
  astro: 'html',
  sh: 'sh',
  bash: 'sh',
  text: 'text',
};

type CodeProps = { className?: string; metastring?: string; children?: string };

/** A fence's code as a snippet: its language, and the `title="…"` and `tab="…"` in its meta. */
function snippetOf(code: ReactNode): Snippet | null {
  if (!isValidElement<CodeProps>(code)) return null;
  const fence = code.props.className?.replace('language-', '') ?? 'text';
  const meta = Object.fromEntries(
    [...(code.props.metastring ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
  return {
    code: (code.props.children ?? '').replace(/\n$/, ''),
    lang: LANGS[fence] ?? 'text',
    title: meta.title ?? fence,
    tab: meta.tab ?? meta.title ?? fence,
  };
}

function Pre({ children }: { children?: ReactNode }) {
  const snippet = snippetOf(children);
  if (!snippet) return null;
  return (
    <CodePanel code={snippet.code} lang={snippet.lang} title={snippet.title} className="my-6" />
  );
}

/** Fences shown one at a time under tabs, the choice remembered across pages: one fence per framework or runtime. */
export function CodeGroup({ children }: { children: ReactNode }) {
  const snippets = Children.toArray(children)
    .map((pre) =>
      isValidElement<{ children?: ReactNode }>(pre) ? snippetOf(pre.props.children) : null,
    )
    .filter((s): s is Snippet => s !== null);
  return <CodeTabs snippets={snippets} />;
}

/** A titled code panel, for code that isn't a fence: `<Code file="route.ts" lang="ts">{`…`}</Code>`. */
export function Code({
  children,
  lang = 'tsx',
  file,
}: {
  children: string;
  lang?: Lang;
  file?: string;
}) {
  return <CodePanel code={children.trim()} lang={lang} title={file ?? lang} className="my-6" />;
}

function Heading({ as: Tag, children }: { as: 'h2' | 'h3'; children?: ReactNode }) {
  const id = slug(children);
  return (
    <Tag
      id={id}
      className={`group scroll-mt-8 font-display text-ink ${Tag === 'h2' ? 'mb-5 mt-16 text-[21px]' : 'mb-3 mt-10 text-[16px]'}`}
    >
      <a
        href={`#${id}`}
        className="relative before:absolute before:-left-5 before:text-accent before:opacity-0 before:transition before:content-['#'] group-hover:before:opacity-100"
      >
        {children}
      </a>
    </Tag>
  );
}

/** The page's title, its alien mark, and its one-line summary from the docs index. */
function Title({ children }: { children?: ReactNode }) {
  const page = DOC_PAGES.find((p) => p.title === textOf(children));
  return (
    <header className="mb-10">
      <h1 className="flex items-center gap-3 font-display text-[clamp(1.9rem,4.5vw,2.5rem)] leading-tight">
        <span aria-hidden className="font-alien text-[0.75em] text-accent">
          {page?.mark}
        </span>
        {children}
      </h1>
      {page && <p className="mt-3 text-[15px] text-ink-2">{page.summary}</p>}
    </header>
  );
}

function A({ href = '', children, ...rest }: ComponentProps<'a'>) {
  const style =
    'text-ink underline decoration-ink/30 underline-offset-[3px] transition hover:text-accent hover:decoration-accent';
  if (href.startsWith('/') || href.startsWith('#'))
    return (
      <Link href={href} className={style}>
        {children}
      </Link>
    );
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={style} {...rest}>
      {children}
    </a>
  );
}

/** An aside: something worth knowing that isn't the main thread. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="my-7 flex gap-3 rounded-lg border border-dashed border-accent/40 bg-accent/[0.05] px-4 py-3.5 text-[14px] leading-relaxed text-ink-2 [&_p]:my-0">
      <span aria-hidden className="font-alien text-accent">
        ⵙ
      </span>
      <div>{children}</div>
    </div>
  );
}

/** Numbered steps down a line, each with a short title and what to do. */
export function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="relative my-8 ml-4 border-l border-dashed border-ink/20 [counter-reset:step]">
      {children}
    </ol>
  );
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="relative mb-10 pl-9 [counter-increment:step] last:mb-0 before:absolute before:-left-[15px] before:top-0 before:grid before:size-[30px] before:place-items-center before:rounded-full before:border before:border-ink/15 before:bg-paper before:font-display before:text-[13px] before:text-accent before:content-[counter(step)]">
      <h3 className="pt-1 font-display text-[16px] text-ink">{title}</h3>
      <div className="[&>*:first-child]:mt-3">{children}</div>
    </li>
  );
}

/** A live example, framed. */
export function Preview({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 flex min-h-36 flex-wrap items-center justify-center gap-8 rounded-lg border border-ink/12 bg-paper-2/40 px-6 py-8 [&>*]:my-0">
      {children}
    </div>
  );
}

/** Every framework's page, as a row of links. */
export function Frameworks() {
  const pages = DOCS.find((g) => g.group === 'frameworks')?.pages ?? [];
  return (
    <div className="my-8 flex flex-wrap gap-2">
      {pages.map((p) => (
        <Link
          key={p.slug}
          href={docHref(p.slug)}
          className="flex items-center gap-2 rounded-md border border-ink/12 px-3 py-2 text-[13px] text-ink transition hover:border-accent hover:text-accent"
        >
          <span aria-hidden className="font-alien text-accent">
            {p.mark}
          </span>
          {p.title}
        </Link>
      ))}
    </div>
  );
}

const text = 'text-[14.5px] leading-[1.8] text-ink-2';

export const prose = {
  h1: Title,
  h2: (p: { children?: ReactNode }) => <Heading as="h2" {...p} />,
  h3: (p: { children?: ReactNode }) => <Heading as="h3" {...p} />,
  p: (p: ComponentProps<'p'>) => <p className={`my-5 max-w-[42rem] ${text}`} {...p} />,
  strong: (p: ComponentProps<'strong'>) => <strong className="font-normal text-ink" {...p} />,
  a: A,
  ul: (p: ComponentProps<'ul'>) => (
    <ul className={`my-5 max-w-[42rem] space-y-2.5 ${text}`} {...p} />
  ),
  ol: (p: ComponentProps<'ol'>) => (
    <ol
      className={`my-5 max-w-[42rem] list-decimal space-y-2.5 pl-5 marker:text-ink-2/50 ${text}`}
      {...p}
    />
  ),
  li: (p: ComponentProps<'li'>) => (
    <li
      className="relative pl-5 [ol_&]:pl-1 [ul_&]:before:absolute [ul_&]:before:left-0 [ul_&]:before:text-accent [ul_&]:before:content-['›']"
      {...p}
    />
  ),
  code: ({ metastring: _, ...p }: ComponentProps<'code'> & { metastring?: string }) => (
    <code className="rounded-[3px] bg-ink/[0.06] px-1 py-px text-[0.9em] text-ink" {...p} />
  ),
  pre: Pre,
  hr: () => <hr className="my-14 border-dashed border-ink/20" />,
  blockquote: ({ children }: { children?: ReactNode }) => <Note>{children}</Note>,
  table: (p: ComponentProps<'table'>) => (
    <div className="my-7 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-[13px]" {...p} />
    </div>
  ),
  th: (p: ComponentProps<'th'>) => (
    <th
      className="border-b border-ink/15 py-2.5 pr-5 text-[11.5px] font-normal text-ink-2"
      {...p}
    />
  ),
  td: (p: ComponentProps<'td'>) => (
    <td
      className="border-b border-ink/8 py-3 pr-5 align-top leading-relaxed text-ink-2 [&_code]:whitespace-nowrap"
      {...p}
    />
  ),
};
