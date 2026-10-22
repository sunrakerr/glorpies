'use client';

import { useEffect, useRef, useState } from 'react';
import { getStage, type Actor } from '@/lib/stage';
import { paintRaster, type Scheduled } from '@/lib/studio';

type Props = {
  seed: number;
  priority: number;
  /** Upper bound on backing-store pixels, to keep memory sane on large screens. */
  maxPx: number;
  label: string;
  /** Tapping the face makes it wobble. */
  pokeable?: boolean;
};

export function FaceCanvas({ seed, priority, maxPx, label, pokeable = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const actorRef = useRef<Actor | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const stage = getStage();
    let disposed = false;
    let painted = 0;
    let visible = true;
    let job: Scheduled<unknown> | null = null;
    setReady(false);

    const paint = () => {
      const px = Math.min(maxPx, Math.round(canvas.clientWidth * window.devicePixelRatio));
      if (!px || (painted && px <= painted * 1.15)) return;
      job?.cancel();
      const next = paintRaster(seed, px, priority);
      job = next;
      next.promise.then(({ face, raster }) => {
        if (disposed) return;
        painted = px;
        canvas.width = canvas.height = raster.px;
        actorRef.current ??= stage.add(canvas, face);
        actorRef.current.raster = raster;
        actorRef.current.visible = visible;
        stage.invalidate(actorRef.current);
        setReady(true);
      }, () => {});
    };

    const resize = new ResizeObserver(paint);
    resize.observe(canvas);
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (actorRef.current) {
        actorRef.current.visible = visible;
        if (visible) stage.invalidate(actorRef.current);
      }
    }, { rootMargin: '120px' });
    seen.observe(canvas);

    return () => {
      disposed = true;
      job?.cancel();
      resize.disconnect();
      seen.disconnect();
      if (actorRef.current) stage.remove(actorRef.current);
      actorRef.current = null;
    };
  }, [seed, priority, maxPx]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        onPointerDown={pokeable ? () => actorRef.current && getStage().poke(actorRef.current) : undefined}
        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'} ${pokeable ? 'cursor-pointer touch-manipulation' : ''}`}
      />
      {!ready && <Sketching />}
    </div>
  );
}

function Sketching() {
  return (
    <svg className="sketching absolute inset-0 m-auto h-1/2 w-1/2 text-ink-2" viewBox="0 0 100 100" fill="none" aria-hidden>
      <path
        pathLength={1}
        d="M52 14c20 1 33 16 32 36-1 21-16 36-35 35C29 84 15 69 16 49 17 29 31 13 50 14c6 .3 10 2 13 4"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}
