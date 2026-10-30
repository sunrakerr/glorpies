import { loadEngine, type Engine } from './engine';
import { buildFace } from './face/build';
import { EYE_POSES, eyePatch, pixelsOf, posed } from './alive';
import { rasterizeFace, renderStill, type Painting, type StillRaster } from './face/render';
import type { Face } from './face/types';
import { makeCanvas } from './canvas';
import { cutBackdrop, cutOut } from './cutout';
import { unguided } from './face/bare';
import { splitLayers } from './layers';
import { expressed } from './expression';
import { DEFAULT_LOOK, lookOf, renderLook, type LookId } from './looks';
import { seedOf, type FaceName } from './seed';
import { stillEyes, type FaceState } from './states';

/** A Map that forgets whatever was used least recently once it holds `max` entries. */
class Recent<K, V> extends Map<K, V> {
  constructor(private readonly max: number) {
    super();
  }
  override get(key: K) {
    const v = super.get(key);
    if (v !== undefined) {
      super.delete(key);
      super.set(key, v);
    }
    return v;
  }
  override set(key: K, v: V) {
    super.delete(key);
    super.set(key, v);
    if (this.size > this.max) this.delete(this.keys().next().value!);
    return this;
  }
}

/** Faces are a few hundred kilobytes of geometry each; a page (or a server) keeps the ones it used last. */
const faces = new Recent<number, Face>(256);
/** Small previews for the style pickers, keyed `seed:look:px`, so reopening a picker is instant. About 110 KB each. */
const thumbs = new Recent<string, HTMLCanvasElement>(240);

/** The face for a seed, built once and cached, wearing a state's expression if given one. */
export function faceFor(seed: number, E: Engine, state: FaceState = 'idle'): Face {
  let f = faces.get(seed);
  if (!f) {
    f = buildFace(seed, E);
    faces.set(seed, f);
  }
  return expressed(f, state);
}

export function forget(seed: number) {
  faces.delete(seed);
  for (const key of thumbs.keys()) if (key.startsWith(`${seed}:`)) thumbs.delete(key);
}

/**
 * Jobs run one at a time between frames, most important first. Paced jobs (eye poses) leave the page
 * as much time as they took, so faces keep animating while their eyes are painted.
 */
type Job = { priority: number; order: number; paced: boolean; run: () => void };
const jobs: Job[] = [];
let pumping = false;
let order = 0;

function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    jobs.sort((a, b) => b.priority - a.priority || a.order - b.order);
    const job = jobs.shift();
    if (!job) {
      pumping = false;
      return;
    }
    const start = performance.now();
    job.run();
    const took = performance.now() - start;
    if (job.paced) setTimeout(step, Math.min(250, took));
    // a job long enough to have cost a frame lets the page draw one before the next starts
    else if (took > 12 && typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(() => setTimeout(step, 0));
    else setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

export type Scheduled<T> = { promise: Promise<T>; cancel: () => void };

/** Work for the queue. Cancelling it, whether it's still waiting for the engine or already queued, rejects with an AbortError. */
export function schedule<T>(priority: number, work: (E: Engine) => T, paced = false): Scheduled<T> {
  let job: Job | null = null;
  let abort: (() => void) | null = null;
  let cancelled = false;
  const promise = new Promise<T>((resolve, reject) => {
    abort = () => reject(new DOMException('cancelled', 'AbortError'));
    loadEngine().then((E) => {
      if (cancelled) return;
      job = {
        priority, order: order++, paced,
        run: () => {
          try { resolve(work(E)); } catch (err) { reject(err); }
        },
      };
      jobs.push(job);
      pump();
    }, reject);
  });
  return {
    promise,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      // a job that already ran has settled, and a second settle is a no-op
      const i = job ? jobs.indexOf(job) : -1;
      if (i >= 0) jobs.splice(i, 1);
      abort?.();
    },
  };
}

export const PRIORITY = { gallery: 1, thumb: 1.5, focus: 3, export: 2 } as const;

/**
 * Eye poses paint below their face's own priority: the opened face's eyes wake
 * after exports but before the gallery, and the gallery's once every face is up.
 */
const POSE_LAG = 1.5;
/** The bare background paints just ahead of the eyes, so faces are split before their eyes come alive. */
const LAYER_LAG = 1.1;
/** A style slower than this to paint gets only its most telling eye poses. */
const SLOW_STYLE_MS = 40;

/** How a face is painted: its look, whether it will move, its mood, and whether it keeps its background. */
export type PaintOptions = {
  look?: LookId;
  lively?: boolean;
  state?: FaceState;
  background?: boolean;
  /** Called if a job after the first painting (a layer, an eye pose) fails; cancelling isn't a failure. */
  onError?: (error: unknown) => void;
};

/** Cancelling a job rejects it with an AbortError, which is not a failure. */
export const isCancelled = (error: unknown) => error instanceof Error && error.name === 'AbortError';

/**
 * Paints a face as a series of small jobs, so the page never stalls for long.
 * Watercolour comes in layers, so it can boil and blink; any other look is one
 * still, then its eye poses, each joining the raster when it's ready. A face
 * that won't move (`lively: false`) gets only the still.
 */
export function paintRaster(seed: number, px: number, priority: number, o: PaintOptions = {}): Scheduled<{ face: Face; raster: Painting }> {
  const { look = DEFAULT_LOOK, lively = true, state = 'idle', background = true } = o;
  const faceOf = (E: Engine) => (background ? faceFor(seed, E, state) : unguided(faceFor(seed, E, state)));
  if (look === DEFAULT_LOOK) {
    return schedule(priority, (E) => {
      const face = faceOf(E);
      const raster = rasterizeFace(face, E, px);
      if (!background) cutBackdrop(raster, face);
      return { face, raster };
    });
  }
  const follow: Scheduled<void>[] = [];
  const later = (prio: number, work: (E: Engine) => void) => {
    const job = schedule(prio, work, true);
    job.promise.catch((error: unknown) => {
      if (!isCancelled(error)) o.onError?.(error);
    });
    follow.push(job);
  };
  const base = schedule(priority, (E) => {
    const face = faceOf(E);
    const start = performance.now();
    // a face that will never move is painted with its eyes already set for its mood, as a still image is
    const whole = renderLook(look, lively || state === 'idle' ? face : posed(face, stillEyes(face, state)), E, px);
    const { motion, eyes, tiles } = lookOf(look);
    const raster: StillRaster = { px, still: whole, layers: 'pending', back: null, figure: null, mask: null, motion, eyes, tiles, patches: [], glance: null };
    // off its background the face is cut out now, before it's ever shown, and moves over nothing
    const cut = background ? null : cutOut(whole, renderLook(look, face, E, px, true));
    if (cut) Object.assign(raster, { still: cut.figure, layers: 'split', back: makeCanvas(px), figure: cut.figure, mask: cut.mask });
    // a slow style gets the poses that matter most (a blink, a glance each way) so the page stays smooth
    const wanted = !lively ? [] : performance.now() - start > SLOW_STYLE_MS ? EYE_POSES.slice(0, 3) : EYE_POSES;

    // first the background bare, so the face can move without it; every face is split before any eyes are painted
    if (lively && !cut) later(priority - LAYER_LAG, (E) => {
      const back = renderLook(look, face, E, px, true);
      const split = splitLayers(whole, back);
      if (split) Object.assign(raster, { layers: 'split', back, figure: split.figure, mask: split.mask });
      else raster.layers = 'whole';
    });

    let rest: Uint8ClampedArray | null = null;
    wanted.forEach((pose, i) => {
      // ordered by pose across faces: every face learns to blink before any learns to glance
      later(priority - POSE_LAG - i * 0.01, (E) => {
        // patches are found against the whole painting, then trimmed to the cut
        rest ??= pixelsOf(whole);
        const patch = eyePatch(rest, renderLook(look, posed(face, pose), E, px), face, pose, raster.mask);
        if (patch) raster.patches.push(patch);
        if (i === wanted.length - 1) rest = null;
      });
    });
    return { face, raster };
  });
  return {
    promise: base.promise,
    cancel: () => {
      base.cancel();
      for (const p of follow) p.cancel();
    },
  };
}

function stillFor(seed: number, look: LookId, px: number, E: Engine): HTMLCanvasElement {
  const face = faceFor(seed, E);
  return look === DEFAULT_LOOK ? renderStill(face, E, px) : renderLook(look, face, E, px);
}

export function cachedThumb(seed: number, look: LookId, px: number): HTMLCanvasElement | null {
  return thumbs.get(`${seed}:${look}:${px}`) ?? null;
}

export function paintThumb(seed: number, look: LookId, px: number): Scheduled<HTMLCanvasElement> {
  return schedule(PRIORITY.thumb, (E) => {
    const c = stillFor(seed, look, px, E);
    thumbs.set(`${seed}:${look}:${px}`, c);
    return c;
  });
}

/** `glorpie-soggy-glorp-ink.png`: the name made safe for a file, or its seed when nothing of it is. */
export function fileName(name: FaceName, ext: string, look: LookId = DEFAULT_LOOK): string {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || seedOf(name).toString(36);
  return `glorpie-${slug}${look === DEFAULT_LOOK ? '' : `-${look}`}.${ext}`;
}
