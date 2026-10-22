import { clamp, TAU, type Pt } from './geometry';
import { drawFrame, restPose, type FaceRaster, type Pose } from './face/render';
import type { Face } from './face/types';
import { W } from './face/types';

/** Hand-drawn animation runs "on twos"; 30fps keeps motion smooth while lines boil at 8fps. */
const FRAME_MS = 1000 / 30;
const BOIL_FPS = 8;
const POINTER_IDLE_MS = 2600;

type Mood = {
  look: Pt;
  target: Pt;
  saccadeAt: number;
  blinkAt: number;
  nextBlink: number;
  /** Damped-spring jiggle: rotation and squash, with velocities. */
  jr: number; jv: number; js: number; jsv: number;
  offset: number;
};

export type Actor = {
  canvas: HTMLCanvasElement;
  face: Face;
  raster: FaceRaster | null;
  visible: boolean;
  needsDraw: boolean;
  mood: Mood;
};

class Stage {
  private actors = new Set<Actor>();
  private alive = true;
  private raf = 0;
  private lastDraw = 0;
  private lastTick = 0;
  private pointer = { x: 0, y: 0, at: -Infinity };

  constructor() {
    window.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY, at: performance.now() };
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { this.pointer.at = -Infinity; });
    document.addEventListener('visibilitychange', () => this.wake());
  }

  add(canvas: HTMLCanvasElement, face: Face): Actor {
    const t = performance.now() / 1000;
    const actor: Actor = {
      canvas, face, raster: null, visible: true, needsDraw: true,
      mood: {
        look: { ...face.gaze }, target: { ...face.gaze }, saccadeAt: t + Math.random() * 2,
        blinkAt: -10, nextBlink: t + 0.5 + Math.random() * face.temper.blinkEvery,
        jr: 0, jv: 0, js: 0, jsv: 0, offset: Math.random(),
      },
    };
    this.actors.add(actor);
    this.wake();
    return actor;
  }

  remove(actor: Actor) {
    this.actors.delete(actor);
  }

  isAlive() {
    return this.alive;
  }

  setAlive(v: boolean) {
    this.alive = v;
    for (const a of this.actors) a.needsDraw = true;
    this.wake();
  }

  invalidate(actor: Actor) {
    actor.needsDraw = true;
    this.wake();
  }

  /** A tap makes the face wobble on its neck and blink in surprise. */
  poke(actor: Actor) {
    const m = actor.mood;
    m.jv += (Math.random() < 0.5 ? -1 : 1) * 2.6;
    m.jsv += 1.4;
    m.blinkAt = performance.now() / 1000;
    this.wake();
  }

  private wake() {
    if (!this.raf && !document.hidden) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    const pending = [...this.actors].some((a) => a.needsDraw);
    if (!(this.alive || pending) || document.hidden) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.alive && now - this.lastDraw < FRAME_MS) return;
    const dt = clamp((now - (this.lastTick || now)) / 1000, 0, 0.05);
    this.lastTick = this.lastDraw = now;
    const t = now / 1000;
    for (const a of this.actors) {
      if (!a.raster) continue;
      if (this.alive && a.visible) this.draw(a, this.pose(a, t, dt, now));
      else if (a.needsDraw) this.draw(a, restPose(a.face));
    }
  };

  private draw(a: Actor, pose: Pose) {
    a.needsDraw = false;
    const ctx = a.canvas.getContext('2d');
    if (ctx && a.raster) drawFrame(ctx, a.face, a.raster, pose, a.canvas.width);
  }

  private pose(a: Actor, t: number, dt: number, now: number): Pose {
    const { face, mood: m } = a;
    const { breathe, sway, phase, blinkEvery } = face.temper;

    if (now - this.pointer.at < POINTER_IDLE_MS) {
      const rect = a.canvas.getBoundingClientRect();
      const ex = face.eyes.reduce((s, e) => s + e.x, 0) / Math.max(1, face.eyes.length);
      const ey = face.eyes.reduce((s, e) => s + e.y, 0) / Math.max(1, face.eyes.length);
      const dx = this.pointer.x - (rect.left + (ex / W) * rect.width);
      const dy = this.pointer.y - (rect.top + (ey / W) * rect.height);
      const k = 1.4 / (Math.hypot(dx, dy) + rect.width * 0.5);
      m.target = { x: clamp(dx * k, -1, 1), y: clamp(dy * k, -1, 1) };
    } else if (t > m.saccadeAt) {
      m.target = { x: clamp(face.gaze.x + (Math.random() - 0.5) * 1.4, -1, 1), y: clamp(face.gaze.y + (Math.random() - 0.5) * 1, -1, 1) };
      m.saccadeAt = t + 0.6 + Math.random() * 2.2;
    }
    const ease = 1 - Math.exp(-dt * 14);
    m.look = { x: m.look.x + (m.target.x - m.look.x) * ease, y: m.look.y + (m.target.y - m.look.y) * ease };

    if (t > m.nextBlink) {
      m.blinkAt = t;
      m.nextBlink = Math.random() < 0.12 ? t + 0.3 : t + blinkEvery * (0.5 + Math.random());
    }
    const u = (t - m.blinkAt) / 0.18;
    const blink = u < 0 || u > 1 ? 1 : u < 0.4 ? 1 - u / 0.4 : (u - 0.4) / 0.6;

    m.jv += (-170 * m.jr - 7 * m.jv) * dt;
    m.jr += m.jv * dt;
    m.jsv += (-200 * m.js - 9 * m.jsv) * dt;
    m.js += m.jsv * dt;

    const breath = Math.sin((TAU * t) / breathe + phase);
    const swing = Math.sin((TAU * t) / (breathe * 1.6) + phase * 1.7);
    return {
      phase: Math.floor(t * BOIL_FPS + m.offset * 7),
      rot: ((sway * Math.PI) / 180) * swing + m.jr * 0.06,
      sx: 1 - 0.008 * breath - m.js * 0.04,
      sy: 1 + 0.012 * breath + m.js * 0.06,
      ty: -1.5 * breath,
      look: m.look,
      blink,
      spin: t * 2.4,
    };
  }
}

let stage: Stage | null = null;

export function getStage(): Stage {
  stage ??= new Stage();
  return stage;
}
