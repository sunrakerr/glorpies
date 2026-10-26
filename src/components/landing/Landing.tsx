'use client';

import { ArrowDown, Dices } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { FULL_LOOKS, lookOf, randomName, resolveLook, seedOf, SHAPES, SMALL_LOOKS, STATES, type FaceState, type LookChoice, type LookId } from 'fuglios';
import { Fuglio } from 'fuglios/react';
import { CodePanel, CopyButton } from '../Code';
import { LookThumb } from '../LookPicker';
import { Sheet } from '../Sheet';
import { SiteHeader } from '../SiteHeader';
import { Pick, Tabs } from '../Tabs';
import { PixelField } from './PixelField';
import { ENTRIES, PROPS, SNIPPET_FILES, SNIPPET_KINDS, SNIPPETS, START, type Choice, type SnippetKind } from './snippets';

const SIZES = [72, 48, 32, 20];

const MOODS: Record<FaceState, string> = {
  idle: 'at ease',
  thinking: 'a thought cloud, eyes up',
  working: 'typing dots, head down',
  waiting: 'a question mark: over to you',
  blocked: 'a red ! and a slump: needs help',
  done: 'sparkles and a hop',
};

/** The install command, in each package manager's own words. */
const INSTALL = { npm: 'npm i fuglios', pnpm: 'pnpm add fuglios', yarn: 'yarn add fuglios', bun: 'bun add fuglios' } as const;
type Manager = keyof typeof INSTALL;
const MANAGERS = Object.keys(INSTALL) as Manager[];

/** The library's front page: a playground whose code is always what you see, then the reference. */
export function Landing() {
  const [c, setC] = useState<Choice>(START);
  // typing repaints a face per keystroke otherwise; the deferred name lets the input stay ahead
  const name = String(useDeferredValue(c.name)) || ' ';
  const set = (patch: Partial<Choice>) => setC((v) => ({ ...v, ...patch }));
  // a new visitor meets a new face; made up on the client so server and client markup agree
  useEffect(() => set({ name: randomName() }), []);

  return (
    <div className="relative z-10 min-h-dvh">
      <PixelField />
      <div className="relative mx-auto max-w-[960px] px-6">
        <SiteHeader className="pt-8" />
        <main>
          <Hero />
          <Section n="01" title="playground" note="type a name, any name">
            <Playground c={c} name={name} set={set} />
          </Section>
          <Section n="02" title="code" note="for the face above" className="mt-16">
            <Usage c={{ ...c, name }} />
          </Section>
          <Section n="03" id="api" title="api" note="react props, element attributes, url query and cli flags alike" className="py-20">
            <Reference onLook={(look) => set({ look })} />
          </Section>
        </main>
        <StatusBar />
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="pb-16 pt-16">
      <h1 className="ink-in font-display text-[clamp(2.5rem,8vw,3.6rem)] leading-[0.98]">
        {['every', 'name', null, 'has', 'a', 'fuglio.'].map((w, i) =>
          w ? <span key={i} style={{ '--i': i } as CSSProperties}>{w}{w === 'fuglio.' ? <span aria-hidden className="cursor" /> : '\u00a0'}</span> : <br key={i} />,
        )}
      </h1>
      <p className="mt-5 max-w-[34rem] text-[15px] leading-relaxed text-ink-2">
        ugly little alien faces, painted in watercolour and ink from any string. deterministic, alive, and with moods for agents. react, a web component, image urls and a cli.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-5">
        <Install />
        <a href="#api" className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2 transition hover:text-ink">
          api reference <ArrowDown className="size-3.5" strokeWidth={1.8} />
        </a>
      </div>
    </section>
  );
}

/** A little terminal with the install command, one tab per package manager. */
function Install() {
  const [manager, setManager] = useState<Manager>('npm');
  return (
    <div className="rounded-lg border border-white/[0.07] bg-term text-term-fg shadow-pill">
      <div className="border-b border-white/[0.07] px-2 py-1.5">
        <Tabs options={MANAGERS} value={manager} onChange={setManager} dark />
      </div>
      <div className="flex h-11 items-center gap-3 pl-4 pr-1.5">
        <code className="min-w-[17ch] text-[13.5px]"><span className="mr-2.5 text-term-accent">❯</span>{INSTALL[manager]}</code>
        <CopyButton text={INSTALL[manager]} />
      </div>
    </div>
  );
}

/** A numbered section with a dashed rule, like a heading in a man page. */
function Section({ n, title, note, id, className = '', children }: { n: string; title: string; note?: string; id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${title}-title`} className={`scroll-mt-8 ${className}`}>
      <div className="mb-8 flex items-center gap-3 text-[11.5px]">
        <span className="text-accent">{n}</span>
        <h2 id={`${title}-title`} className="scroll-mt-8 font-display text-[15px] leading-none">{title}</h2>
        <span aria-hidden className="h-px flex-1 bg-[repeating-linear-gradient(90deg,currentColor_0_4px,transparent_4px_8px)] text-ink/20" />
        {note && <span className="hidden text-ink-2/80 sm:inline">// {note}</span>}
      </div>
      {children}
    </section>
  );
}

function Playground({ c, name, set }: { c: Choice; name: string; set: (p: Partial<Choice>) => void }) {
  const seed = seedOf(name);
  const portraitLook: LookId = c.look === 'auto' ? 'watercolour' : c.look;
  return (
    <div className="grid gap-x-12 gap-y-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <figure className="pin-in">
          <Sheet seed={seed} tilt={-1.2}>
            {/* square fills the sheet; the rounder crops sit on it with a margin of paper, as they would in an app.
                the paper is opaque and stays cream in the dark, so the sheet's lifted-corner shadows don't show through */}
            <div className="bg-[#f4eee4]">
              <div className={`relative aspect-square w-full overflow-hidden bg-[#ebe3d5]/50 transition-[padding] duration-500 ease-soft ${c.shape === 'square' ? 'p-0' : 'p-[8%]'}`}>
                <Fuglio
                  name={name} look={portraitLook} size="100%" shape={c.shape} state={c.state} alive={c.alive} pokeable priority={3} label={`The face for “${name}”`}
                  style={{ transition: 'border-radius .5s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow .5s', boxShadow: c.shape === 'square' ? 'none' : '0 1px 2px rgb(60 40 20 / 0.12), 0 12px 28px -14px rgb(60 40 20 / 0.4)' }}
                />
              </div>
            </div>
          </Sheet>
          <figcaption className="mt-6 flex items-baseline justify-between gap-3 text-[11.5px] text-ink-2">
            <span>specimen <span className="text-ink">№{seed}</span> · {lookOf(portraitLook).name.toLowerCase()}</span>
            <span>tap to poke</span>
          </figcaption>
        </figure>

        <div role="radiogroup" aria-label="Size" className="mt-8 flex items-end gap-5">
          {SIZES.map((size) => (
            <button key={size} type="button" role="radio" aria-checked={c.size === size} onClick={() => set({ size })} className="flex flex-col items-center gap-2">
              <Fuglio name={name} size={size} look={c.look} shape={c.shape} state={c.state} alive={c.alive} priority={2.5} label={`${name}, ${size}px`} />
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
        <Field flag="look" hint={c.look === 'auto' ? `auto → ${resolveLook(c.look, c.size)} at ${c.size}px` : `"${c.look}"`}>
          <LookGrid seed={seed} value={c.look} onChange={(look) => set({ look })} />
        </Field>
        <Field flag="shape">
          <Tabs options={SHAPES} value={c.shape} onChange={(shape) => set({ shape })} />
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

/** A flag column and its value, like a command's options. */
function Field({ flag, hint, children }: { flag: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-4">
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
        <div className="flex items-center gap-3">
          <Tabs options={SNIPPET_KINDS} value={tab} onChange={setTab} dark />
          <span className="ml-auto hidden sm:inline">{file}</span>
        </div>
      }
    />
  );
}

function Reference({ onLook }: { onLook: (l: LookId) => void }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-ink/15 text-[11px] text-ink-2">
              {['prop', 'takes', 'default', 'what it does'].map((h) => <th key={h} className="py-2 pr-4 font-normal"># {h}</th>)}
            </tr>
          </thead>
          <tbody>
            {PROPS.map((p) => (
              <tr key={p.prop} className="border-b border-ink/8 align-top transition hover:bg-ink/[0.025]">
                <td className="py-3 pr-4 text-ink">{p.prop}</td>
                <td className="max-w-[15rem] py-3 pr-4 text-accent">{p.type}</td>
                <td className="whitespace-nowrap py-3 pr-4 text-ink-2">{p.fallback}</td>
                <td className="py-3 leading-relaxed text-ink-2">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-14 text-[12px] text-ink-2"># look ids</h3>
      <div className="mt-3 space-y-4 text-[12px]">
        {[{ label: 'paintings', looks: FULL_LOOKS }, { label: 'avatars', looks: SMALL_LOOKS }].map((g) => (
          <div key={g.label} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-2 w-[68px] text-ink-2/70">{g.label}</span>
            {g.looks.map((l) => (
              <a key={l.id} href="#playground-title" title={`${l.name}: try it above`} onClick={() => onLook(l.id)} className="rounded-[3px] border border-ink/12 px-1.5 py-0.5 text-ink transition hover:border-accent hover:text-accent">
                {l.id}
              </a>
            ))}
          </div>
        ))}
      </div>

      <h3 className="mt-14 text-[12px] text-ink-2"># imports</h3>
      <ul className="mt-3 divide-y divide-ink/8 border-y border-ink/8 text-[12.5px]">
        {ENTRIES.map((e) => (
          <li key={e.path} className="grid list-none gap-1 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
            <code className="text-accent">{e.path}</code>
            <span className="leading-relaxed text-ink-2">{e.what}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The footer as a terminal status line. */
function StatusBar() {
  return (
    <footer className="mb-8 flex h-8 items-stretch overflow-hidden rounded-md border border-ink/12 text-[11px] text-ink-2">
      <span className="flex items-center bg-accent px-2.5 font-display text-paper">alive</span>
      <span className="flex items-center border-r border-ink/12 px-3 text-ink">fuglios</span>
      <span className="hidden items-center px-3 sm:flex">mit · painted in code · every face stays on your page</span>
      <span className="ml-auto flex items-center gap-4 px-3">
        <Link href="/gallery" className="transition hover:text-ink">./gallery</Link>
        <Link href="/how" className="transition hover:text-ink">./how</Link>
      </span>
    </footer>
  );
}
