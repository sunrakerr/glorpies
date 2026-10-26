import { loadEngine, type Engine } from './engine';
import { buildFace } from './face/build';
import { EYE_POSES, eyePatch, pixelsOf, posed } from './alive';
import { rasterizeFace, renderStill, type Painting, type StillRaster } from './face/render';
import { faceToSVG } from './face/svg';
import type { Face } from './face/types';
import { splitLayers } from './layers';
import { expressed } from './expression';
import { DEFAULT_LOOK, lookOf, renderLook, type LookId } from './looks';
import { seedOf, type FaceName } from './seed';
import type { FaceState } from './states';

const faces = new Map<number, Face>();
/** Small previews for the style pickers, keyed `seed:look:px`, so reopening a picker is instant. */
const thumbs = new Map<string, HTMLCanvasElement>();

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

export function newSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Painting a face is a few hundred milliseconds of canvas work, so jobs run one
 * at a time between frames, most important first (the face being inspected,
 * then exports, then the gallery in order). Paced jobs (eye poses) leave the
 * page as much free time as they took, so faces keep animating smoothly while
 * their eyes are painted.
 */
type Job = { priority: number; order: number; paced: boolean; run: () => void; cancelled: boolean };
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
    if (!job.cancelled) job.run();
    const took = performance.now() - start;
    if (job.paced) setTimeout(step, Math.min(250, took));
    // a job long enough to have cost a frame lets the page draw one before the next starts
    else if (took > 12 && typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(() => setTimeout(step, 0));
    else setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

export type Scheduled<T> = { promise: Promise<T>; cancel: () => void };

export function schedule<T>(priority: number, work: (E: Engine) => T, paced = false): Scheduled<T> {
  let job: Job | null = null;
  let cancelled = false;
  const promise = loadEngine().then(
    (E) =>
      new Promise<T>((resolve, reject) => {
        if (cancelled) return reject(new DOMException('cancelled', 'AbortError'));
        job = {
          priority, order: order++, paced, cancelled: false,
          run: () => {
            try { resolve(work(E)); } catch (err) { reject(err); }
          },
        };
        jobs.push(job);
        pump();
      }),
  );
  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (job) job.cancelled = true;
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

/**
 * Watercolour is painted in layers so it can boil and blink. Every other style
 * is one still, followed by its eye poses: each is a job of its own so the page
 * never stalls for long, and each patch joins the raster as soon as it's ready.
 */
/** `lively: false` paints only the still: a face that will never move needs no split background and no eye poses. */
export function paintRaster(seed: number, px: number, priority: number, look: LookId = DEFAULT_LOOK, lively = true, state: FaceState = 'idle'): Scheduled<{ face: Face; raster: Painting }> {
  if (look === DEFAULT_LOOK) {
    return schedule(priority, (E) => {
      const face = faceFor(seed, E, state);
      return { face, raster: rasterizeFace(face, E, px) };
    });
  }
  const follow: Scheduled<void>[] = [];
  const later = (prio: number, work: (E: Engine) => void) => {
    const job = schedule(prio, work, true);
    job.promise.catch(() => {});
    follow.push(job);
  };
  const base = schedule(priority, (E) => {
    const face = faceFor(seed, E, state);
    const start = performance.now();
    const still = renderLook(look, face, E, px);
    const { motion, eyes, tiles } = lookOf(look);
    const raster: StillRaster = { px, still, layers: 'pending', back: null, figure: null, mask: null, motion, eyes, tiles, patches: [], glance: null };
    // a slow style gets the poses that matter most (a blink, a glance each way) so the page stays smooth
    const wanted = !lively ? [] : performance.now() - start > SLOW_STYLE_MS ? EYE_POSES.slice(0, 3) : EYE_POSES;

    // first the background bare, so the face can move without it; every face is split before any eyes are painted
    if (lively) later(priority - LAYER_LAG, (E) => {
      const back = renderLook(look, face, E, px, true);
      const split = splitLayers(still, back);
      if (split) Object.assign(raster, { layers: 'split', back, figure: split.figure, mask: split.mask });
      else raster.layers = 'whole';
    });

    let rest: Uint8ClampedArray | null = null;
    wanted.forEach((pose, i) => {
      // ordered by pose across faces: every face learns to blink before any learns to glance
      later(priority - POSE_LAG - i * 0.01, (E) => {
        rest ??= pixelsOf(still);
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

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
}

export async function pngBlob(seed: number, px: number, look: LookId = DEFAULT_LOOK): Promise<Blob> {
  return encode(await schedule(PRIORITY.export, (E) => stillFor(seed, look, px, E)).promise);
}

/**
 * Watercolour exports as real vector paths. The other styles are built from
 * pixels, dots, tiles and glyphs, so their SVG wraps the PNG.
 */
export function svgMarkup(seed: number, look: LookId = DEFAULT_LOOK, px = 1024): Promise<string> {
  return schedule(PRIORITY.export, (E) => {
    if (look === DEFAULT_LOOK) return faceToSVG(faceFor(seed, E), E, px);
    const href = stillFor(seed, look, px, E).toDataURL('image/png');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}"><image width="${px}" height="${px}" href="${href}"/></svg>`;
  }).promise;
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

/** `fuglio-soggy-glorp-ink.png`: the name made safe for a file, or its seed when nothing of it is. */
export function fileName(name: FaceName, ext: string, look: LookId = DEFAULT_LOOK): string {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || seedOf(name).toString(36);
  return `fuglio-${slug}${look === DEFAULT_LOOK ? '' : `-${look}`}.${ext}`;
}
