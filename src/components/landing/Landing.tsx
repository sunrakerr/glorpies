'use client';

import { ArrowRight, Copy, Dices, FileCode, ImageDown } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useEffect, useState, type ReactNode } from 'react';
import { FACES, FULL_LOOKS, lookOf, randomName, resolveLook, seedOf, SHAPES, SMALL_LOOKS, STATES, type FaceState, type LookChoice, type LookId } from 'glorpies';
import { Glorpie } from 'glorpies/react';
import { runAction, type ActionKind } from '../actions';
import { CodePanel } from '../Code';
import { Install } from '../Install';
import { LookThumb } from '../LookPicker';
import { Sheet } from '../Sheet';
import { Page, Section } from '../Page';
import { Pick, Tabs } from '../Tabs';
import { IconButton, ToastView, useToast } from '../ui';
import { DOCS, docHref } from '@/lib/docs';
import { MARKS } from '@/lib/glyphs';
import { Crowd } from './Crowd';
import { Transmission } from './Transmission';
import { SNIPPET_FILES, SNIPPET_KINDS, SNIPPETS, START, type Choice, type SnippetKind } from './snippets';

const SIZES = [72, 48, 32, 20];

const FRAMEWORKS = DOCS.find((g) => g.group === 'frameworks')?.pages ?? [];

const MOODS: Record<FaceState, string> = {
  idle: 'at ease',
  thinking: 'a thought cloud, eyes up',
  working: 'typing dots, head down',
  waiting: 'a question mark: over to you',
  blocked: 'a red ! and a slump: needs help',
  done: 'sparkles and a hop',
};

/** The library's front page: a playground whose code is always what you see. */
export function Landing() {
  const [c, setC] = useState<Choice>(START);
  // typing repaints a face per keystroke otherwise; the deferred name lets the input stay ahead
  const name = String(useDeferredValue(c.name)) || ' ';
  const set = (patch: Partial<Choice>) => setC((v) => ({ ...v, ...patch }));
  // a new visitor meets a new face; made up on the client so server and client markup agree
  useEffect(() => set({ name: randomName() }), []);

  return (
    <Page>
      <Hero
        onPick={(picked) => {
          set({ name: picked });
          document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      <Section title="playground" mark={MARKS.playground} id="playground">
        <Playground c={c} name={name} set={set} />
      </Section>
      <Section title="install" mark={MARKS.install} className="mt-12">
        <Install />
      </Section>
      <Section title="code" mark={MARKS.code} className="mt-12">
        <Usage c={{ ...c, name }} />
      </Section>
    </Page>
  );
}

function Hero({ onPick }: { onPick: (name: string) => void }) {
  return (
    <section className="grid items-center gap-x-10 gap-y-6 pb-12 pt-12 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:pt-6">
      <div>
        <Transmission className="font-display text-[clamp(1.9rem,5.6vw,2.75rem)] leading-[1.05]" />
        <p className="mt-4 max-w-[36rem] text-[15px] leading-relaxed text-ink-2">
          <span className="text-ink">{FACES.toLocaleString('en-US')}</span> different hand-painted aliens: over a million for every person on earth. any string (a username, an email, a bot id) gets its own, and always the same one. for every framework, as server images and from a cli, with zero dependencies.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-5">
          <Link href="/docs" className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-[12.5px] text-paper transition hover:bg-accent hover:text-paper">
            read the docs <ArrowRight className="size-3.5" strokeWidth={1.8} />
          </Link>
          <Link href="/gallery" className="text-[12.5px] text-ink-2 transition hover:text-ink">
            <span className="text-ink-2/50">./</span>gallery
          </Link>
        </div>
        <nav aria-label="Frameworks" className="mt-7 flex flex-wrap items-center gap-x-1 gap-y-2 text-[12px]">
          <span className="mr-2 text-ink-2/70">works with</span>
          {FRAMEWORKS.map((p) => (
            <Link key={p.slug} href={docHref(p.slug)} className="rounded-[3px] px-1.5 py-0.5 text-ink-2 transition hover:bg-ink/[0.06] hover:text-ink">
              {p.title}
            </Link>
          ))}
        </nav>
      </div>
      <Crowd onPick={onPick} />
    </section>
  );
}

function Playground({ c, name, set }: { c: Choice; name: string; set: (p: Partial<Choice>) => void }) {
  const seed = seedOf(name);
  const portraitLook: LookId = c.look === 'auto' ? 'watercolour' : c.look;
  const { toast, show } = useToast();
  // exports are the portrait as shown: its look, crop and mood
  const act = (kind: ActionKind) => runAction(kind, { name, look: portraitLook, shape: c.shape, state: c.state, background: c.background }, 1024, show);
  const blank = !name.trim();
  return (
    <div className="grid gap-x-12 gap-y-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <figure className="pin-in">
          <Sheet seed={seed} tilt={-1.2}>
            {/* square fills the sheet; the rounder crops sit on it with a margin of paper, as they would in an app.
                the paper is opaque and stays cream in the dark, so the sheet's lifted-corner shadows don't show through */}
            <div className="bg-[#f4eee4]">
              {/* off its background the face sits on a checkerboard, the usual sign for transparent */}
              <div className={`relative aspect-square w-full overflow-hidden transition-[padding] duration-500 ease-soft ${c.background !== false ? 'bg-[#ebe3d5]/50' : 'checker'} ${c.shape === 'square' || c.background === false ? 'p-0' : 'p-[8%]'}`}>
                <Glorpie
                  name={name} look={portraitLook} size="100%" shape={c.shape} state={c.state} background={c.background} alive={c.alive} pokeable priority={3} label={`The face for “${name}”`}
                  style={{ transition: 'border-radius .5s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow .5s', boxShadow: c.shape === 'square' || c.background === false ? 'none' : '0 1px 2px rgb(60 40 20 / 0.12), 0 12px 28px -14px rgb(60 40 20 / 0.4)' }}
                />
              </div>
            </div>
          </Sheet>
          <figcaption className="mt-5 flex items-center justify-between gap-3 text-[11.5px] text-ink-2">
            <span>specimen <span className="text-ink">№{seed}</span> · {lookOf(portraitLook).name.toLowerCase()}</span>
            <span className="-mr-2 flex items-center">
              <IconButton label="Copy image" disabled={blank} onClick={() => act('copy')}><Copy className="size-[16px]" strokeWidth={1.8} /></IconButton>
              <IconButton label="Download PNG" disabled={blank} onClick={() => act('png')}><ImageDown className="size-[16px]" strokeWidth={1.8} /></IconButton>
              <IconButton label="Download SVG" disabled={blank} onClick={() => act('svg')}><FileCode className="size-[16px]" strokeWidth={1.8} /></IconButton>
            </span>
          </figcaption>
          <ToastView toast={toast} />
        </figure>

        <div role="radiogroup" aria-label="Size" className="mt-8 flex items-end gap-5">
          {SIZES.map((size) => (
            <button key={size} type="button" role="radio" aria-checked={c.size === size} onClick={() => set({ size })} className="flex flex-col items-center gap-2">
              <Glorpie name={name} size={size} look={c.look} shape={c.shape} state={c.state} background={c.background} alive={c.alive} priority={2.5} label={`${name}, ${size}px`} />
              <Pick on={c.size === size}>{size}</Pick>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-7">
        <Field flag="name">
          <label className="flex items-center gap-2.5 border-b border-ink/25 pb-1.5 transition focus-within:border-accent">
            <span aria-hidden className="text-accent">❯</span>
            <input
              value={c.name}
              onChange={(e) => set({ name: e.target.value })}
              spellCheck={false}
              autoComplete="off"
              maxLength={64}
              aria-label="Name"
              placeholder="type any name"
              className="w-full bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-2/50"
            />
            <button type="button" onClick={() => set({ name: randomName() })} aria-label="Make up a name" title="Make up a name" className="-my-1 grid size-8 shrink-0 place-items-center rounded-md text-ink-2 transition hover:bg-ink/[0.06] hover:text-ink active:scale-90">
              <Dices className="size-[17px]" strokeWidth={1.8} />
            </button>
          </label>
        </Field>
        <Field flag="look" hint={c.look === 'auto' ? `auto picks ${resolveLook(c.look, c.size)} at ${c.size}px` : `"${c.look}"`}>
          <LookGrid seed={seed} value={c.look} onChange={(look) => set({ look })} />
        </Field>
        <Field flag="background" hint={c.background === false ? 'only the face: no backdrop, no pencil lines' : typeof c.background === 'string' ? 'any css colour, in place of its paper' : undefined}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Tabs
              options={['true', 'false', 'colour'] as const}
              value={typeof c.background === 'string' ? 'colour' : String(c.background) as 'true' | 'false'}
              onChange={(v) => set({ background: v === 'colour' ? (typeof c.background === 'string' ? c.background : SWATCHES[0]!) : v === 'true' })}
            />
            {typeof c.background === 'string' && <Swatches value={c.background} onChange={(background) => set({ background })} />}
          </div>
        </Field>
        <Field flag="shape" hint={c.background !== false ? undefined : 'nothing to crop without a background'}>
          <div className={c.background !== false ? '' : 'pointer-events-none opacity-40'}>
            <Tabs options={SHAPES} value={c.shape} onChange={(shape) => set({ shape })} />
          </div>
        </Field>
        <Field flag="state" hint={MOODS[c.state]}>
          <Tabs options={STATES} value={c.state} onChange={(state) => set({ state })} />
        </Field>
        <Field flag="alive">
          <Tabs options={['true', 'false'] as const} value={c.alive ? 'true' : 'false'} onChange={(v) => set({ alive: v === 'true' })} />
        </Field>
      </div>
    </div>
  );
}

/** Colours to try a face on; the last swatch opens a picker for any other. */
const SWATCHES = ['#ffe9a8', '#ffd2c2', '#d4efc4', '#cfe2ff', '#e5d8ff', '#2b231d'];

function Swatches({ value, onChange }: { value: string; onChange: (colour: string) => void }) {
  const custom = !SWATCHES.includes(value);
  const ring = (on: boolean) => (on ? 'ring-2 ring-accent ring-offset-2 ring-offset-paper' : 'ring-1 ring-inset ring-ink/15 hover:scale-110');
  return (
    <div role="radiogroup" aria-label="Background colour" className="flex items-center gap-2">
      {SWATCHES.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} aria-label={s} title={s} onClick={() => onChange(s)} className={`size-5 rounded-full transition ${ring(value === s)}`} style={{ background: s }} />
      ))}
      <label title="Any colour" className={`relative size-5 cursor-pointer rounded-full transition ${ring(custom)}`} style={{ background: custom ? value : 'conic-gradient(#ff8a8a, #ffd36e, #a6e88a, #7fc8ff, #c39bff, #ff8a8a)' }}>
        <input type="color" aria-label="Any colour" value={/^#[\da-f]{6}$/i.test(value) ? value : '#ffe9a8'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

/** A flag column and its value, like a command's options. */
function Field({ flag, hint, children }: { flag: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4">
      <span className="pt-1 text-[12px] text-ink-2">--{flag}</span>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-2 text-[11.5px] text-ink-2/80">{hint}</p>}
      </div>
    </div>
  );
}

/** Every look as this face, paintings or avatars at a time, plus auto. */
function LookGrid({ seed, value, onChange }: { seed: number; value: LookChoice; onChange: (l: LookChoice) => void }) {
  const [group, setGroup] = useState<'paintings' | 'avatars'>(SMALL_LOOKS.some((l) => l.id === value) ? 'avatars' : 'paintings');
  const looks = group === 'paintings' ? FULL_LOOKS : SMALL_LOOKS;
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <Tabs options={['paintings', 'avatars'] as const} value={group} onChange={setGroup} />
        <button type="button" onClick={() => onChange('auto')} aria-pressed={value === 'auto'}>
          <Pick on={value === 'auto'}>auto</Pick>
        </button>
      </div>
      <div className="-mx-3 mt-1 grid max-h-[244px] grid-cols-6 gap-2.5 overflow-y-auto px-3 pb-6 pt-3 [mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-28px),transparent)] [scrollbar-width:none]">
        {looks.map((l) => (
          <button
            key={`${group}-${l.id}`}
            type="button"
            title={`${l.name}: "${l.id}"`}
            aria-label={l.name}
            aria-pressed={value === l.id}
            onClick={() => onChange(l.id)}
            className={`relative aspect-square overflow-hidden rounded-[4px] bg-paper-2/60 shadow-sheet transition duration-300 ease-soft ${value === l.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-paper' : 'hover:-translate-y-0.5 hover:shadow-sheet-lift'}`}
          >
            <LookThumb seed={seed} look={l.id} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Usage({ c }: { c: Choice }) {
  const [tab, setTab] = useState<SnippetKind>('react');
  const { file, lang } = SNIPPET_FILES[tab];
  return (
    <CodePanel
      code={SNIPPETS[tab](c)}
      lang={lang}
      title={
        <div className="flex min-w-0 items-center gap-3">
          <Tabs options={SNIPPET_KINDS} value={tab} onChange={setTab} dark scroll />
          <span className="ml-auto hidden shrink-0 sm:inline">{file}</span>
        </div>
      }
    />
  );
}
