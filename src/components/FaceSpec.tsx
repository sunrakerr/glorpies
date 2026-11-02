'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import { lookOf, type LookId } from 'glorpies/internal/looks';
import { CodePanel, CopyButton } from './Code';
import { SNIPPET_FILES, SNIPPETS, type Choice } from './landing/snippets';
import { Tabs } from './Tabs';

const KINDS = ['react', 'vue', 'svelte', 'html', 'url', 'cli'] as const;
type Kind = (typeof KINDS)[number];

/** What it takes to show this exact face in your own app: its name and its look, with the code for each way in. */
export function FaceSpec({
  name,
  look,
  background,
  onClose,
  className = '',
}: {
  name: string;
  look: LookId;
  background: boolean;
  onClose: () => void;
  className?: string;
}) {
  const [kind, setKind] = useState<Kind>('react');
  const l = lookOf(look);
  const c: Choice = {
    name,
    look,
    shape: 'circle',
    state: 'idle',
    background,
    alive: true,
    size: 48,
  };
  return (
    <aside
      aria-label="Use this face"
      className={`rounded-2xl border border-ink/10 bg-paper p-5 shadow-pill ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[15px]">use this face</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 -mt-1 grid size-8 place-items-center rounded-full text-ink/60 transition hover:bg-ink/[0.07] hover:text-ink"
        >
          <X className="size-4" strokeWidth={1.8} />
        </button>
      </div>

      <dl className="mt-4 divide-y divide-ink/8 border-y border-ink/8 text-[12.5px]">
        <Row k="name" v={`"${name}"`} copy={name} note="pass it as name for exactly this face" />
        <Row k="look" v={`"${l.id}"`} copy={l.id} note={`${l.name.toLowerCase()}. ${l.note}`} />
      </dl>

      <CodePanel
        code={SNIPPETS[kind](c)}
        lang={SNIPPET_FILES[kind].lang}
        title={<Tabs options={KINDS} value={kind} onChange={setKind} dark />}
        compact
        className="mt-5 [&_code]:min-w-0 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:text-[11.5px]"
      />
      <p className="mt-3 text-[11px] leading-relaxed text-ink-2/80">
        size, shape, state and alive work as in{' '}
        <a
          href="/docs/options"
          className="underline decoration-ink/25 underline-offset-2 hover:text-ink"
        >
          the options
        </a>
        , in every framework.
      </p>
    </aside>
  );
}

function Row({ k, v, copy, note }: { k: string; v: string; copy: string; note: string }) {
  return (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-x-3 py-2.5">
      <dt className="text-ink-2">{k}</dt>
      <dd className="min-w-0">
        <code className="text-accent">{v}</code>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-2/80">{note}</p>
      </dd>
      <CopyButton text={copy} className="-my-1" />
    </div>
  );
}
