import Link from 'next/link';
import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { DOC_PAGES } from '@/lib/docs';
import type { Lang } from '@/lib/highlight';
import { CodePanel } from '../Code';

const textOf = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
};

const slug = (node: ReactNode) => textOf(node).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const LANGS: Record<string, Lang> = { tsx: 'tsx', jsx: 'tsx', ts: 'ts', js: 'ts', json: 'ts', html: 'html', vue: 'html', svelte: 'html', sh: 'sh', bash: 'sh', text: 'text' };

/** A titled code panel: `<Code file="app/api/face/route.ts" lang="ts">{`…`}</Code>`. */
export function Code({ children, lang = 'tsx', file }: { children: string; lang?: Lang; file?: string }) {
  return <CodePanel code={children.trim()} lang={lang} title={file ?? lang} className="my-5" />;
}

function Pre({ children }: { children?: ReactNode }) {
  const code = children as ReactElement<{ className?: string; children?: string }>;
  const lang = LANGS[code.props.className?.replace('language-', '') ?? ''] ?? 'text';
  return <Code lang={lang}>{code.props.children ?? ''}</Code>;
}

function Heading({ as: Tag, children }: { as: 'h2' | 'h3'; children?: ReactNode }) {
  const id = slug(children);
  return (
    <Tag id={id} className={`group scroll-mt-8 font-display text-ink ${Tag === 'h2' ? 'mb-4 mt-14 text-[17px]' : 'mb-3 mt-9 text-[14px]'}`}>
      <a href={`#${id}`} className="relative before:absolute before:-left-5 before:text-accent before:opacity-0 before:transition before:content-['#'] group-hover:before:opacity-100">
        {children}
      </a>
    </Tag>
  );
}

function Title({ children }: { children?: ReactNode }) {
  return (
    <h1 className="flex items-center gap-3 font-display text-[clamp(1.6rem,4vw,2.1rem)] leading-tight">
      <span aria-hidden className="font-alien text-[0.8em] text-accent">{DOC_PAGES.find((p) => p.title === textOf(children))?.mark}</span>
      {children}
    </h1>
  );
}

function A({ href = '', children, ...rest }: ComponentProps<'a'>) {
  const style = 'text-ink underline decoration-ink/30 underline-offset-[3px] transition hover:text-accent hover:decoration-accent';
  if (href.startsWith('/') || href.startsWith('#')) return <Link href={href} className={style}>{children}</Link>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className={style} {...rest}>{children}</a>;
}

/** The paragraph under a page's title. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="mb-10 mt-4 max-w-[40rem] text-[15px] leading-relaxed text-ink-2">{children}</p>;
}

/** An aside: something worth knowing that isn't the main thread. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 flex gap-3 rounded-lg border border-dashed border-accent/40 bg-accent/[0.05] px-4 py-3 text-[13px] leading-relaxed text-ink-2 [&_p]:my-0">
      <span aria-hidden className="font-alien text-accent">ⵙ</span>
      <div>{children}</div>
    </div>
  );
}

export const prose = {
  h1: Title,
  h2: (p: { children?: ReactNode }) => <Heading as="h2" {...p} />,
  h3: (p: { children?: ReactNode }) => <Heading as="h3" {...p} />,
  p: (p: ComponentProps<'p'>) => <p className="my-4 max-w-[44rem] text-[13.5px] leading-[1.75] text-ink-2" {...p} />,
  strong: (p: ComponentProps<'strong'>) => <strong className="font-normal text-ink" {...p} />,
  a: A,
  ul: (p: ComponentProps<'ul'>) => <ul className="my-4 max-w-[44rem] space-y-2 text-[13.5px] leading-relaxed text-ink-2" {...p} />,
  ol: (p: ComponentProps<'ol'>) => <ol className="my-4 max-w-[44rem] list-decimal space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-2 marker:text-ink-2/50" {...p} />,
  li: (p: ComponentProps<'li'>) => <li className="relative pl-5 [ol_&]:pl-1 [ul_&]:before:absolute [ul_&]:before:left-0 [ul_&]:before:text-accent [ul_&]:before:content-['›']" {...p} />,
  code: (p: ComponentProps<'code'>) => <code className="rounded-[3px] bg-ink/[0.06] px-1 py-px text-[0.92em] text-ink" {...p} />,
  pre: Pre,
  hr: () => <hr className="my-12 border-dashed border-ink/20" />,
  blockquote: ({ children }: { children?: ReactNode }) => <Note>{children}</Note>,
  table: (p: ComponentProps<'table'>) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-[12.5px]" {...p} />
    </div>
  ),
  th: (p: ComponentProps<'th'>) => <th className="border-b border-ink/15 py-2 pr-4 text-[11px] font-normal text-ink-2" {...p} />,
  td: (p: ComponentProps<'td'>) => <td className="border-b border-ink/8 py-2.5 pr-4 align-top leading-relaxed text-ink-2 [&_code]:whitespace-nowrap" {...p} />,
};
