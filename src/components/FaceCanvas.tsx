'use client';

import { useEffect, useRef, useState } from 'react';
import type { LookId } from 'glorpies/internal/looks';
import { mount, type FaceHandle } from 'glorpies/internal/mount';
import { FaceSkeleton, Restyling } from './Loading';

type Props = {
  seed: number;
  look: LookId;
  priority: number;
  /** Upper bound on backing-store pixels, to keep memory sane on large screens. */
  maxPx: number;
  label: string;
  /** Tapping the face makes it wobble. */
  pokeable?: boolean;
  /** `false` paints only the face, on nothing. */
  background?: boolean;
  /** Shown on the loaders, for views large enough to carry words. */
  caption?: string;
};

/** Nothing painted yet, an old style still showing while a new one paints, or done. */
type Status = 'empty' | 'restyling' | 'ready';

const CROSSFADE_MS = 650;

export function FaceCanvas({
  seed,
  look,
  priority,
  maxPx,
  label,
  pokeable = false,
  background = true,
  caption,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLCanvasElement>(null);
  const handle = useRef<FaceHandle | null>(null);
  const [status, setStatus] = useState<Status>('empty');

  // one mounted face per seed; a new style repaints it in place under a crossfade
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    setStatus('empty');
    const h = mount(canvas, {
      name: seed,
      look,
      priority,
      maxPx,
      pokeable,
      background,
      // the gallery's own switch holds every face still at once, through the stage
      alive: true,
      // restyles crossfade here, under the gallery's own restyling mark
      morph: false,
      beforePaint: (first) => {
        if (!first) crossfade(canvas, ghostRef.current);
      },
      onPaint: () => setStatus('ready'),
    });
    handle.current = h;
    return () => {
      h.destroy();
      handle.current = null;
    };
    // look, priority and size changes are passed to the mounted face below rather than remounting it
  }, [seed]);

  const shownLook = useRef(look);
  useEffect(() => {
    const h = handle.current;
    if (!h) return;
    // only a new style repaints; the old one stays up, marked as restyling, until it lands
    if (look !== shownLook.current) setStatus((s) => (s === 'ready' ? 'restyling' : s));
    shownLook.current = look;
    h.update({ look, priority, maxPx, pokeable, background });
  }, [look, priority, maxPx, pokeable, background]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        aria-busy={status !== 'ready'}
        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${status === 'empty' ? 'opacity-0' : 'opacity-100'} ${status === 'restyling' ? 'face-restyling' : ''} ${pokeable ? 'cursor-pointer touch-manipulation' : ''}`}
      />
      <canvas
        ref={ghostRef}
        aria-hidden
        className="face-restyling pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
      {status === 'empty' && <FaceSkeleton caption={caption} />}
      {status === 'restyling' && <Restyling caption={caption} />}
    </div>
  );
}

/** Holds the outgoing painting over the canvas and dissolves it into the new one. */
function crossfade(from: HTMLCanvasElement, ghost: HTMLCanvasElement | null) {
  if (!ghost || !from.width || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // a fade still running from a quicker change would otherwise clear this one when it ends
  for (const a of ghost.getAnimations()) a.cancel();
  ghost.width = from.width;
  ghost.height = from.height;
  ghost.getContext('2d')?.drawImage(from, 0, 0);
  ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: CROSSFADE_MS,
    easing: 'ease-out',
  }).onfinish = () => {
    // release the copy's pixels once it has faded
    ghost.width = ghost.height = 0;
  };
}
