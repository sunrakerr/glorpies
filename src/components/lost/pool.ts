import { faceCanvas, randomName } from 'glorpies';

/** Different faces painted for a visit; after that, they come round again. */
const UNIQUE = 36;

export type FacePool = {
  /** A face not yet seen, or once all are painted any of them; null while the next is still on the easel. */
  take(): CanvasImageSource | null;
  dispose(): void;
};

/**
 * Watercolour faces `px` pixels across, painted ahead of need. A worker paints
 * them where the browser has OffscreenCanvas, so letting one in never stalls
 * the page; anywhere else they're painted here, one at a time, between frames.
 */
export function facePool(px: number): FacePool {
  const names = Array.from({ length: UNIQUE }, () => randomName());
  const ready: CanvasImageSource[] = [];
  let taken = 0;
  let disposed = false;
  let timer = 0;

  const paintHere = (from: number) => {
    let i = from;
    const next = () => {
      if (disposed || i >= names.length) return;
      ready.push(faceCanvas(names[i++]!, { look: 'watercolour', size: px, background: false }));
      timer = window.setTimeout(next, 120);
    };
    next();
  };

  let worker: Worker | null = null;
  if (typeof OffscreenCanvas === 'function' && typeof Worker === 'function') {
    try {
      worker = new Worker(new URL('./painter.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
  }
  if (worker) {
    worker.onmessage = (e: MessageEvent<ImageBitmap>) => {
      if (disposed) e.data.close();
      else ready.push(e.data);
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      paintHere(ready.length);
    };
    for (const name of names) worker.postMessage({ name, px });
  } else {
    paintHere(0);
  }

  return {
    take() {
      if (taken < ready.length) return ready[taken++]!;
      // nobody sees a face twice until every one has been painted
      return ready.length === names.length
        ? ready[Math.floor(Math.random() * ready.length)]!
        : null;
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      clearTimeout(timer);
      for (const face of ready) if (face instanceof ImageBitmap) face.close();
    },
  };
}
