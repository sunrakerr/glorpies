'use client';

import { Pause, Play, RotateCcw, Shuffle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadEngine } from 'glorpies/internal/engine';
import { DURATION, prepareExplainer, VH, VW, type Explainer, type Fonts } from '@/lib/explainer';
import { newSeed } from 'glorpies/internal/studio';
import { SiteHeader } from './SiteHeader';
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
    document.fonts.load(`400 18px ${text}`),
    document.fonts.load(`500 13px ${text}`),
    document.fonts.load(`600 13px ${text}`),
  ]);
  return { display, text };
}

export function HowItsDrawn() {
  const ref = useRef<HTMLCanvasElement>(null);
  const film = useRef<Explainer | null>(null);
  const clock = useRef({ t: 0, last: 0 });
  const [seed, setSeed] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const q = Number(new URLSearchParams(location.search).get('seed'));
    setSeed(Number.isInteger(q) && q > 0 ? q : newSeed());
  }, []);

  useEffect(() => {
    if (seed === null) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      const [E, fonts] = await Promise.all([loadEngine(), loadFonts()]);
      // let the "mixing paints" note paint before the heavy synchronous prepare
      await new Promise((r) => setTimeout(r, 30));
      if (cancelled) return;
      film.current = prepareExplainer(seed, E, K, fonts);
      clock.current = { t: 0, last: performance.now() };
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [seed]);

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
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative z-10 flex min-h-dvh flex-col items-center gap-6 px-4 pb-8">
      <SiteHeader className="w-full max-w-[1280px] px-1 pt-8" />
      <div className="relative my-auto w-full max-w-[1280px]">
        <canvas
          ref={ref}
          width={VW * K}
          height={VH * K}
          className="block aspect-video w-full rounded-[4px] shadow-sheet"
          role="img"
          aria-label="Animated explainer: how a face is painted, from seed to paper, glazes, hatching, ink, live eyes and line boil"
        />
        {!ready && (
          <p className="sketching absolute inset-0 grid place-items-center font-display text-xl text-ink-2">Mixing paints…</p>
        )}
      </div>
      <Pill>
        <IconButton label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)} disabled={!ready}>
          {playing ? <Pause className="size-[17px]" strokeWidth={1.8} /> : <Play className="size-[17px]" strokeWidth={1.8} />}
        </IconButton>
        <IconButton label="From the start" onClick={restart} disabled={!ready}>
          <RotateCcw className="size-[17px]" strokeWidth={1.8} />
        </IconButton>
        <IconButton label="Paint another face" onClick={() => setSeed(newSeed())} disabled={!ready}>
          <Shuffle className="size-[17px]" strokeWidth={1.8} />
        </IconButton>
      </Pill>
    </div>
  );
}
