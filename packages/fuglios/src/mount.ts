import { marksFor, resolveLook, type LookChoice } from './looks';
import { seedOf, type FaceName } from './seed';
import { getStage, type Actor } from './stage';
import type { FaceState } from './states';
import { paintRaster, PRIORITY, type Scheduled } from './studio';

export type MountOptions = {
  name: FaceName;
  look?: LookChoice;
  /** Breathing, blinking and following the pointer. Defaults to on, unless the reader prefers reduced motion. */
  alive?: boolean;
  state?: FaceState;
  /** Tapping the face makes it wobble. */
  pokeable?: boolean;
  /** Higher paints sooner when many faces are waiting. */
  priority?: number;
  /** Upper bound on backing-store pixels, to keep memory sane for very large faces. */
  maxPx?: number;
  /** Called just before a finished painting replaces what's on the canvas, and just after; `first` is true for the very first. */
  beforePaint?: (first: boolean) => void;
  onPaint?: (first: boolean) => void;
};

export type FaceHandle = {
  update(next: Partial<MountOptions>): void;
  poke(): void;
  destroy(): void;
};

const prefersStill = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Brings a face to life on a canvas you own. The canvas is sized by CSS; the
 * face is painted at its displayed size times the device pixel ratio, painted
 * again if it grows, animated only while on screen, and repainted in place
 * when its name or look changes.
 */
export function mount(canvas: HTMLCanvasElement, options: MountOptions): FaceHandle {
  let o: MountOptions = { ...options };
  const stage = getStage();
  let actor: Actor | null = null;
  let job: Scheduled<unknown> | null = null;
  let painted = 0;
  let key = '';
  /** Whether what's on the canvas was painted to move (with its background split and eye poses). */
  let lively = false;
  let visible = true;
  /** Faces paint only once they come near the screen, so a long page doesn't paint everything at load. */
  let near = typeof IntersectionObserver !== 'function';
  let disposed = false;

  const cssSize = () => canvas.clientWidth || canvas.width;
  const apply = () => {
    if (!actor) return;
    actor.alive = wantsLife();
    actor.visible = visible;
    stage.invalidate(actor);
  };

  const wantsLife = () => o.alive ?? !prefersStill();

  const paint = (force = false) => {
    if (!near) return;
    const css = cssSize();
    const px = Math.min(o.maxPx ?? 1600, Math.round(css * (globalThis.devicePixelRatio || 1)));
    const look = resolveLook(o.look, css);
    const seed = seedOf(o.name);
    // a state is painted into the face (its expression), so a new state is a new painting
    const state = o.state ?? 'idle';
    const next = `${seed}:${look}:${state}`;
    if (!px || (!force && next === key && painted && px <= painted * 1.15)) return;
    if (next !== key) painted = 0;
    key = next;
    job?.cancel();
    lively = wantsLife();
    const j = paintRaster(seed, px, o.priority ?? PRIORITY.gallery, look, lively, state);
    job = j;
    j.promise.then(({ face, raster }) => {
      if (disposed || job !== j) return;
      const first = !actor;
      o.beforePaint?.(first);
      if (canvas.width !== raster.px) canvas.width = canvas.height = raster.px;
      if (actor && actor.face.seed !== face.seed) {
        stage.remove(actor);
        actor = null;
      }
      actor ??= stage.add(canvas, face);
      actor.face = face;
      actor.raster = raster;
      // the state changes with the painting that shows it, never ahead of it
      actor.state = state;
      actor.marks = marksFor(look, face, raster.px);
      painted = px;
      apply();
      stage.drawNow(actor);
      o.onPaint?.(first);
    }, () => {});
  };

  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => paint()) : null;
  resize?.observe(canvas);
  const seen = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([e]) => {
        visible = e?.isIntersecting ?? true;
        if (visible && !near) {
          near = true;
          paint();
        }
        apply();
      }, { rootMargin: '200px' })
    : null;
  seen?.observe(canvas);
  const tap = () => actor && stage.poke(actor);
  if (o.pokeable) canvas.addEventListener('pointerdown', tap);
  paint();

  return {
    update(next) {
      const was = o;
      o = { ...o, ...next };
      if (was.pokeable !== o.pokeable) {
        if (o.pokeable) canvas.addEventListener('pointerdown', tap);
        else canvas.removeEventListener('pointerdown', tap);
      }
      // a face that was painted to hold still is painted again, fully, when it comes alive
      if (seedOf(was.name) !== seedOf(o.name) || was.look !== o.look || was.state !== o.state || (wantsLife() && !lively)) paint(true);
      else apply();
    },
    poke: tap,
    destroy() {
      disposed = true;
      job?.cancel();
      resize?.disconnect();
      seen?.disconnect();
      canvas.removeEventListener('pointerdown', tap);
      if (actor) stage.remove(actor);
      actor = null;
    },
  };
}
