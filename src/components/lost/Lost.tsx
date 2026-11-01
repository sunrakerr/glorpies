'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { PixelField } from '../landing/PixelField';
import { Transmission } from '../landing/Transmission';
import { facePool } from './pool';
import { draw, emptySpace, letIn, resize, step, type Colours } from './space';

/** Largest a glorpie is shown, in CSS pixels; faces are painted for it at the screen's density. */
const LARGEST = 90;
/** How far the pointer travels between one glorpie and the next. */
const SPACING = 64;
const FIRST = 4;

const LINES = ['404'];

/** The page that isn't there: a 404 in space, a saucer on patrol, and glorpies left in the pointer's wake. */
export function Lost() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const space = emptySpace(innerWidth, innerHeight);
    const pool = facePool(Math.ceil(LARGEST * Math.min(3, Math.max(2, devicePixelRatio || 1))));
    let waiting = FIRST;

    const fit = () => {
      const dpr = Math.min(3, devicePixelRatio || 1);
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingQuality = 'high';
      resize(space, innerWidth, innerHeight);
    };
    fit();

    let colours: Colours = { ink: '#000000', paper: '#ffffff', accent: '#00ff00' };
    const tint = () => {
      const css = getComputedStyle(document.documentElement);
      const read = (v: string) => css.getPropertyValue(v).trim();
      colours = { ink: read('--color-ink'), paper: read('--color-paper'), accent: read('--color-accent') };
    };
    tint();
    const theme = new MutationObserver(tint);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const arrive = (x: number, y: number, vx = 0, vy = 0) => {
      const face = pool.take();
      if (face) letIn(space, face, x, y, vx, vy);
      return Boolean(face);
    };

    let last: { x: number; y: number; t: number } | null = null;
    const move = (e: PointerEvent) => {
      const now = performance.now();
      if (!last) {
        last = { x: e.clientX, y: e.clientY, t: now };
        return;
      }
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (Math.hypot(dx, dy) < SPACING) return;
      // a glorpie leaves at a share of the pointer's speed, so a flick flings it
      const seconds = Math.max(0.016, (now - last.t) / 1000);
      if (arrive(e.clientX, e.clientY, (dx / seconds) * 0.25, (dy / seconds) * 0.25)) last = { x: e.clientX, y: e.clientY, t: now };
    };
    const leave = () => {
      last = null;
    };

    let frame = 0;
    let before = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(1 / 30, (now - before) / 1000);
      before = now;
      if (waiting && arrive(space.width * (0.15 + 0.7 * Math.random()), space.height * (0.55 + 0.35 * Math.random()))) waiting--;
      step(space, dt, still);
      draw(g, space, now / 1000, colours);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    addEventListener('resize', fit);
    addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', fit);
      removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      theme.disconnect();
      pool.dispose();
    };
  }, []);

  return (
    <div className="relative grid min-h-dvh touch-none select-none place-items-center overflow-hidden px-6">
      <PixelField />
      <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-20 h-full w-full" />
      <main className="relative z-10 flex flex-col items-center text-center">
        <Transmission lines={LINES} label="page not found" className="font-display text-[clamp(6rem,24vw,13rem)] leading-none [&_.cursor]:hidden" />
        <p className="mt-5 text-[13px] text-ink-2">this page drifted off into space.</p>
        <Link href="/" className="mt-8 inline-flex items-center gap-1.5 rounded-md bg-ink px-3.5 py-2 text-[12.5px] text-paper transition hover:bg-accent">
          <ArrowLeft className="size-3.5" strokeWidth={1.8} /> take me home
        </Link>
      </main>
    </div>
  );
}
