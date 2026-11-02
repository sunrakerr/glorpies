'use client';

import { useEffect, useRef, useState } from 'react';

/** CSS pixels per cell. */
const CELL = 8;
/** Generations a second; slow enough to read as drift rather than flicker. */
const RATE = 9;
/** How much of a dead cell's glow survives each generation. */
const FADE = 0.86;

/** 4×4 Bayer thresholds, so the fading trails come out as 1-bit ordered dither. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** The page's margins as a slow Game of Life in ink: dying cells fade through a dither, and the pointer sows new ones. */
export function PixelField() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = matchMedia('(min-width: 1280px)');
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return wide ? <VisiblePixelField /> : null;
}

function VisiblePixelField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0,
      h = 0;
    let life = new Uint8Array(0),
      next = new Uint8Array(0),
      glow = new Float32Array(0);
    let img: ImageData | null = null;
    // cells are drawn in the theme's --field colour, read again whenever the theme changes
    let ink = [0, 0, 0];
    const tint = () => {
      const hex = getComputedStyle(canvas).getPropertyValue('--field').trim().replace('#', '');
      ink = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
    };

    const sow = (x0: number, y0: number, r: number, p: number) => {
      for (let y = y0 - r; y <= y0 + r; y++)
        for (let x = x0 - r; x <= x0 + r; x++)
          if (x >= 0 && y >= 0 && x < w && y < h && Math.random() < p) life[y * w + x] = 1;
    };
    const size = () => {
      w = Math.ceil(innerWidth / CELL);
      h = Math.ceil(innerHeight / CELL);
      canvas.width = w;
      canvas.height = h;
      life = new Uint8Array(w * h);
      next = new Uint8Array(w * h);
      glow = new Float32Array(w * h);
      img = g.createImageData(w, h);
      for (let i = 0; i < 14; i++)
        sow(
          Math.floor(Math.random() * w),
          Math.floor(Math.random() * h),
          6 + Math.floor(Math.random() * 10),
          0.42,
        );
    };

    const step = () => {
      let alive = 0;
      for (let y = 0; y < h; y++) {
        const up = ((y + h - 1) % h) * w,
          row = y * w,
          down = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
          const l = (x + w - 1) % w,
            r = (x + 1) % w;
          const n =
            life[up + l]! +
            life[up + x]! +
            life[up + r]! +
            life[row + l]! +
            life[row + r]! +
            life[down + l]! +
            life[down + x]! +
            life[down + r]!;
          const on = n === 3 || (n === 2 && life[row + x] === 1) ? 1 : 0;
          next[row + x] = on;
          alive += on;
        }
      }
      [life, next] = [next, life];
      for (let i = 0; i < life.length; i++) glow[i] = life[i] ? 1 : glow[i]! * FADE;
      // life tends to burn down to a few blinkers; scatter a little fresh soup now and then
      if (alive < w * h * 0.012 || Math.random() < 0.04)
        sow(
          Math.floor(Math.random() * w),
          Math.floor(Math.random() * h),
          4 + Math.floor(Math.random() * 6),
          0.45,
        );
    };

    const draw = () => {
      if (!img) return;
      const d = img.data;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x,
            o = i * 4;
          const on = glow[i]! > BAYER[(y & 3) * 4 + (x & 3)]! * 0.9 + 0.08;
          d[o] = ink[0]!;
          d[o + 1] = ink[1]!;
          d[o + 2] = ink[2]!;
          d[o + 3] = on ? 255 : 0;
        }
      g.putImageData(img, 0, 0);
    };

    tint();
    size();
    for (let i = 0; i < 30; i++) step();
    draw();
    const theme = new MutationObserver(() => {
      tint();
      draw();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    let raf = 0,
      last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / RATE) return;
      last = now;
      step();
      draw();
    };
    const run = () => {
      if (!raf && !still && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const visibility = () => (document.hidden ? pause() : run());
    const move = (e: PointerEvent) =>
      sow(Math.floor(e.clientX / CELL), Math.floor(e.clientY / CELL), 1, 0.5);
    let resizing = 0;
    const resize = () => {
      clearTimeout(resizing);
      resizing = window.setTimeout(() => {
        size();
        draw();
      }, 150);
    };
    run();
    document.addEventListener('visibilitychange', visibility);
    addEventListener('resize', resize);
    if (!still) addEventListener('pointermove', move, { passive: true });
    return () => {
      pause();
      theme.disconnect();
      clearTimeout(resizing);
      document.removeEventListener('visibilitychange', visibility);
      removeEventListener('resize', resize);
      removeEventListener('pointermove', move);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 h-full w-full opacity-[0.07] [--field:var(--color-ink)] [image-rendering:pixelated] dark:opacity-[0.11] dark:[--field:var(--color-accent)] [mask-image:linear-gradient(to_right,black,black_calc(50%-650px),transparent_calc(50%-560px),transparent_calc(50%+560px),black_calc(50%+650px),black)]"
    />
  );
}
