'use client';

import { Pause, Play, RotateCcw, Shuffle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { randomName } from 'glorpies';
import { loadEngine } from 'glorpies/internal/engine';
import { DURATION, prepareExplainer, VH, VW, type Explainer, type Fonts, type Theme } from '@/lib/explainer';
import { MARKS } from '@/lib/glyphs';
import { Heading, Page } from './Page';
import { IconButton, Pill } from './ui';

/** Output pixels per layout pixel: the explainer always renders at 1920×1080 and the page scales it. */
const K = 1.5;

declare global {
  interface Window {
    /** Frame-exact access for recording the explainer to video. */
    __explainer?: { duration: number; ready: boolean; draw: (t: number) => void };
  }
}

async function loadFonts(): Promise<Fonts> {
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue('--font-pixel').trim() || 'ui-monospace, monospace';
  const text = css.getPropertyValue('--font-geist-mono').trim() || 'ui-monospace, monospace';
  await Promise.all([
    document.fonts.load(`500 44px ${display}`),
    document.fonts.load(`400 17px ${text}`),
    document.fonts.load(`500 15px ${text}`),
  ]);
  return { display, text };
}

/** The page's colours right now, as the explainer paints them. */
function themeNow(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { page: v('--color-paper'), ink: v('--color-ink'), ink2: v('--color-ink-2'), accent: v('--color-accent') };
}

export function HowItsDrawn() {
  const ref = useRef<HTMLCanvasElement>(null);
  const film = useRef<Explainer | null>(null);
  const clock = useRef({ t: 0, last: 0 });
  const [name, setName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);

  // a name from the address (?name=…), or a made-up one, chosen on the client
  useEffect(() => {
    setName(new URLSearchParams(location.search).get('name') || randomName());
  }, []);

  useEffect(() => {
    if (name === null) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      const [E, fonts] = await Promise.all([loadEngine(), loadFonts()]);
      // let the "mixing paints" note paint before the heavy synchronous prepare
      await new Promise((r) => setTimeout(r, 30));
      if (cancelled) return;
      film.current = prepareExplainer(name, E, K, fonts, themeNow());
      clock.current = { t: 0, last: performance.now() };
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  // the theme toggle repaints the page behind the film, not the film
  useEffect(() => {
    const watch = new MutationObserver(() => film.current?.setTheme(themeNow()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!ready || !canvas || !ctx || !film.current) return;
    const f = film.current;
    window.__explainer = { duration: DURATION, ready: true, draw: (t) => f.draw(ctx, t) };
    let raf = 0;
    const tick = (now: number) => {
      const c = clock.current;
      if (playing) c.t = (c.t + Math.min(0.1, (now - c.last) / 1000)) % DURATION;
      c.last = now;
      f.draw(ctx, c.t);
      raf = requestAnimationFrame(tick);
    };
    clock.current.last = performance.now();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, playing]);

  const restart = useCallback(() => {
    clock.current.t = 0;
    setPlaying(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || (e.target as HTMLElement | null)?.closest('input, textarea, button')) return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Page className="pt-12">
      <Heading as="h1" title="how it's drawn" mark={MARKS.sun} aside={name ? <>painting <span className="text-ink">{name}</span></> : undefined} />
      <div className="relative">
        <canvas
          ref={ref}
          width={VW * K}
          height={VH * K}
          className="block aspect-video w-full rounded-lg border border-ink/10"
          role="img"
          aria-label="Animated explainer: how a glorpie is painted, from its name and seed to paper, pencil, glazes, hatching, ink, live eyes and line boil"
        />
        {!ready && <p className="sketching absolute inset-0 grid place-items-center font-display text-xl text-ink-2">mixing paints…</p>}
      </div>
      <div className="mt-5 flex justify-center">
        <Pill>
          <IconButton label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)} disabled={!ready}>
            {playing ? <Pause className="size-[17px]" strokeWidth={1.8} /> : <Play className="size-[17px]" strokeWidth={1.8} />}
          </IconButton>
          <IconButton label="From the start" onClick={restart} disabled={!ready}>
            <RotateCcw className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Paint another glorpie" onClick={() => setName(randomName())} disabled={!ready}>
            <Shuffle className="size-[17px]" strokeWidth={1.8} />
          </IconButton>
        </Pill>
      </div>
    </Page>
  );
}
