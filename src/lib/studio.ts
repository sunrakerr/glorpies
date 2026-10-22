import { loadEngine, type Engine } from './engine';
import { buildFace } from './face/build';
import { rasterizeFace, renderStill, type FaceRaster } from './face/render';
import { faceToSVG } from './face/svg';
import type { Face } from './face/types';

const faces = new Map<number, Face>();

export function faceFor(seed: number, E: Engine): Face {
  let f = faces.get(seed);
  if (!f) {
    f = buildFace(seed, E);
    faces.set(seed, f);
  }
  return f;
}

export function forget(seed: number) {
  faces.delete(seed);
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Painting a face is a few hundred milliseconds of canvas work, so jobs run one
 * at a time between frames, most important first (the face being inspected,
 * then exports, then the gallery in order).
 */
type Job = { priority: number; order: number; run: () => void; cancelled: boolean };
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
    if (!job.cancelled) job.run();
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

export type Scheduled<T> = { promise: Promise<T>; cancel: () => void };

export function schedule<T>(priority: number, work: (E: Engine) => T): Scheduled<T> {
  let job: Job | null = null;
  let cancelled = false;
  const promise = loadEngine().then(
    (E) =>
      new Promise<T>((resolve, reject) => {
        if (cancelled) return reject(new DOMException('cancelled', 'AbortError'));
        job = {
          priority, order: order++, cancelled: false,
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

export const PRIORITY = { gallery: 1, focus: 3, export: 2 } as const;

export function paintRaster(seed: number, px: number, priority: number): Scheduled<{ face: Face; raster: FaceRaster }> {
  return schedule(priority, (E) => {
    const face = faceFor(seed, E);
    return { face, raster: rasterizeFace(face, E, px) };
  });
}

export async function pngBlob(seed: number, px: number): Promise<Blob> {
  const canvas = await schedule(PRIORITY.export, (E) => renderStill(faceFor(seed, E), E, px)).promise;
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
}

export function svgMarkup(seed: number, px = 1024): Promise<string> {
  return schedule(PRIORITY.export, (E) => faceToSVG(faceFor(seed, E), E, px)).promise;
}

export function fileName(seed: number, ext: string): string {
  return `face-${seed.toString(36)}.${ext}`;
}
