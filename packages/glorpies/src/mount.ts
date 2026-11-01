import { marksFor, resolveLook, type LookChoice } from './looks';
import { seedOf, type FaceName } from './seed';
import { getStage, type Actor } from './stage';
import type { FaceState } from './states';
import { isCancelled, paintRaster, PRIORITY, type Scheduled } from './studio';

export type MountOptions = {
  name: FaceName;
  look?: LookChoice;
  /** Breathing, blinking and following the pointer. Defaults to on, unless the reader prefers reduced motion. */
  alive?: boolean;
  state?: FaceState;
  /** `false` lifts the face off its paper: no backdrop, no pencil lines, transparent all around. Defaults to true. */
  background?: boolean;
  /** Tapping the face makes it wobble. */
  pokeable?: boolean;
  /** Higher paints sooner when many faces are waiting. */
  priority?: number;
  /** Upper bound on backing-store pixels, to keep memory sane for very large faces. */
  maxPx?: number;
  /** Called just before a finished painting replaces what's on the canvas, and just after; `first` is true for the very first. */
  beforePaint?: (first: boolean) => void;
  onPaint?: (first: boolean) => void;
  /** Called if a painting fails; without it the error is logged. */
  onError?: (error: unknown) => void;
  /** A new look, state or name blurs out of the old painting and into the new. Defaults to true; off under reduced motion. */
  morph?: boolean;
};

export type FaceHandle = {
  update(next: Partial<MountOptions>): void;
  poke(): void;
  destroy(): void;
};

/** Milliseconds to blur out of a painting, and to come back into focus on the next. */
const VEIL_IN = 180, VEIL_OUT = 420;

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
  /** A repaint asked for while the face was off screen, held until it comes back (true if it must repaint even unchanged). */
  let deferred: boolean | null = null;
  let disposed = false;
  /** The blur over a face whose next painting is on its way. */
  let veil: { anim: Animation; blur: string } | null = null;

  const cssSize = () => canvas.clientWidth || canvas.width;
  const apply = () => {
    if (!actor) return;
    actor.alive = wantsLife();
    actor.visible = visible;
    stage.invalidate(actor);
  };

  const wantsLife = () => o.alive ?? !prefersStill();

  // run as animations rather than drawn, so they stay smooth while the next painting holds up the page
  const cover = () => {
    if (veil || o.morph === false || prefersStill() || typeof canvas.animate !== 'function') return;
    const blur = `blur(${Math.min(12, Math.max(1.5, cssSize() * 0.025)).toFixed(1)}px) saturate(0.7)`;
    veil = { anim: canvas.animate([{ filter: 'none', opacity: 1 }, { filter: blur, opacity: 0.8 }], { duration: VEIL_IN, easing: 'ease-in', fill: 'forwards' }), blur };
  };
  const uncover = () => {
    if (!veil) return;
    const { anim, blur } = veil;
    veil = null;
    anim.cancel();
    canvas.animate([{ filter: blur, opacity: 0.8 }, { filter: 'none', opacity: 1 }], { duration: VEIL_OUT, easing: 'ease-out' });
  };

  const report = (error: unknown) => {
    uncover();
    if (disposed || isCancelled(error)) return;
    if (o.onError) o.onError(error);
    else console.error('glorpies: could not paint', o.name, error);
  };

  const paint = (force = false) => {
    if (!near) return;
    // a restyle of a long page repaints only what's on screen; the rest catch up as they scroll in
    if (painted && !visible) {
      deferred = deferred || force;
      return;
    }
    const css = cssSize();
    const px = Math.min(o.maxPx ?? 1600, Math.round(css * (globalThis.devicePixelRatio || 1)));
    const look = resolveLook(o.look, css);
    const seed = seedOf(o.name);
    // a state is painted into the face (its expression), so a new state is a new painting
    const state = o.state ?? 'idle';
    const background = o.background ?? true;
    const next = `${seed}:${look}:${state}:${background}`;
    if (!px || (!force && next === key && painted && px <= painted * 1.15)) return;
    if (next !== key) {
      if (actor && key) cover();
      painted = 0;
    }
    key = next;
    job?.cancel();
    lively = wantsLife();
    const j = paintRaster(seed, px, o.priority ?? PRIORITY.gallery, { look, lively, state, background, onError: report });
    job = j;
    j.promise.then(async ({ face, raster }) => {
      // the swap happens under the blur, once it has fully come down
      if (veil) await veil.anim.finished.catch(() => {});
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
      uncover();
      o.onPaint?.(first);
    }, (error: unknown) => {
      if (job === j) report(error);
    });
    // a face held still while its layers and eye poses were painted comes alive once they're in
    void j.settled.then(() => {
      if (!disposed && job === j) apply();
    });
  };

  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => paint()) : null;
  resize?.observe(canvas);
  // browser zoom changes the pixel ratio but not the CSS size, so the observer above never sees it
  let zoom: MediaQueryList | null = null;
  const watchZoom = () => {
    zoom?.removeEventListener('change', onZoom);
    zoom = typeof matchMedia === 'function' ? matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`) : null;
    zoom?.addEventListener('change', onZoom);
  };
  const onZoom = () => {
    watchZoom();
    paint();
  };
  watchZoom();
  const seen = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([e]) => {
        visible = e?.isIntersecting ?? true;
        if (visible && !near) {
          near = true;
          paint();
        } else if (visible && deferred !== null) {
          const force = deferred;
          deferred = null;
          paint(force);
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
      const repaint = seedOf(was.name) !== seedOf(o.name) || was.look !== o.look || was.state !== o.state || (was.background ?? true) !== (o.background ?? true);
      if (repaint || (wantsLife() && !lively)) paint(true);
      else apply();
    },
    poke: tap,
    destroy() {
      disposed = true;
      job?.cancel();
      veil?.anim.cancel();
      resize?.disconnect();
      zoom?.removeEventListener('change', onZoom);
      seen?.disconnect();
      canvas.removeEventListener('pointerdown', tap);
      if (actor) stage.remove(actor);
      actor = null;
    },
  };
}
