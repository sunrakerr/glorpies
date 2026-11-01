import { clamp, TAU, type Pt } from './geometry';
import { drawFrame, drawStill, isStill, restPose, type Painting, type Pose } from './face/render';
import type { Face } from './face/types';
import { W } from './face/types';
import { drawMarks, type MarkFrame } from './marks';
import { BEHAVIOUR, bodyAt, gazeFor, type FaceState } from './states';

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
  nudgeAt: number;
  /** Damped-spring jiggle: rotation and squash, with velocities. */
  jr: number; jv: number; js: number; jsv: number;
  offset: number;
};

export type Actor = {
  canvas: HTMLCanvasElement;
  face: Face;
  raster: Painting | null;
  visible: boolean;
  /** This face moves when the stage is alive; false holds it at rest regardless. */
  alive: boolean;
  state: FaceState;
  /** Where the head sits on the canvas, for the state's marks; null draws none. */
  marks: MarkFrame | null;
  needsDraw: boolean;
  mood: Mood;
};

/**
 * The one animation loop every face on the page shares: a single
 * requestAnimationFrame, drawing only faces that are on screen, at 30fps.
 */
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
      canvas, face, raster: null, visible: true, alive: true, state: 'idle', marks: null, needsDraw: true,
      mood: {
        look: { ...face.gaze }, target: { ...face.gaze }, saccadeAt: t + Math.random() * 2,
        blinkAt: -10, nextBlink: t + 0.5 + Math.random() * face.temper.blinkEvery, nudgeAt: t + 1 + Math.random() * 2,
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

  private moving(a: Actor) {
    return this.alive && a.alive && a.visible && !(a.raster && isStill(a.raster) && a.raster.settling);
  }

  private wake() {
    if (!this.raf && !document.hidden) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    const busy = [...this.actors].some((a) => a.needsDraw || (this.moving(a) && a.raster));
    if (!busy || document.hidden) return;
    this.raf = requestAnimationFrame(this.tick);
    if (now - this.lastDraw < FRAME_MS) return;
    const dt = clamp((now - (this.lastTick || now)) / 1000, 0, 0.05);
    this.lastTick = this.lastDraw = now;
    const t = now / 1000;
    for (const a of this.actors) {
      if (!a.raster) continue;
      if (this.moving(a)) this.draw(a, this.pose(a, t, dt, now));
      else if (a.needsDraw) this.draw(a, this.rest(a));
    }
  };

  /** Draws straight away, so swapping in a new painting never leaves a blank frame. */
  drawNow(a: Actor) {
    const now = performance.now();
    this.draw(a, this.moving(a) ? this.pose(a, now / 1000, 0, now) : this.rest(a));
  }

  /** A face holding still still shows its state in its eyes. */
  private rest(a: Actor): Pose {
    const b = BEHAVIOUR[a.state];
    const body = bodyAt(a.face, a.state, 0);
    return { ...restPose(a.face), rot: body.rot, ty: BEHAVIOUR[a.state].body.slump, look: a.state === 'idle' ? a.face.gaze : gazeFor(a.face, a.state), blink: b.open };
  }

  private draw(a: Actor, pose: Pose) {
    a.needsDraw = false;
    const ctx = a.canvas.getContext('2d');
    if (!ctx || !a.raster) return;
    if (isStill(a.raster)) drawStill(ctx, a.face, a.raster, pose, a.canvas.width);
    else drawFrame(ctx, a.face, a.raster, pose, a.canvas.width);
    if (a.marks) drawMarks(ctx, a.face, a.state, a.marks, pose.t, !this.moving(a));
  }

  private pose(a: Actor, t: number, dt: number, now: number): Pose {
    const { face, mood: m } = a;
    const b = BEHAVIOUR[a.state];
    const { breathe: period, sway, phase, blinkEvery } = face.temper;
    const breathe = period * b.breathe;

    if (b.follow && now - this.pointer.at < POINTER_IDLE_MS) {
      const rect = a.canvas.getBoundingClientRect();
      const ex = face.eyes.reduce((s, e) => s + e.x, 0) / Math.max(1, face.eyes.length);
      const ey = face.eyes.reduce((s, e) => s + e.y, 0) / Math.max(1, face.eyes.length);
      const dx = this.pointer.x - (rect.left + (ex / W) * rect.width);
      const dy = this.pointer.y - (rect.top + (ey / W) * rect.height);
      const k = 1.4 / (Math.hypot(dx, dy) + rect.width * 0.5);
      m.target = { x: clamp(dx * k, -1, 1), y: clamp(dy * k, -1, 1) };
    } else if (t > m.saccadeAt) {
      const c = gazeFor(face, a.state);
      m.target = { x: clamp(c.x + (Math.random() - 0.5) * b.spread.x, -1, 1), y: clamp(c.y + (Math.random() - 0.5) * b.spread.y, -1, 1) };
      m.saccadeAt = t + b.every[0] + Math.random() * (b.every[1] - b.every[0]);
    }
    const ease = 1 - Math.exp(-dt * 14);
    m.look = { x: m.look.x + (m.target.x - m.look.x) * ease, y: m.look.y + (m.target.y - m.look.y) * ease };

    if (t > m.nextBlink) {
      m.blinkAt = t;
      const gap = blinkEvery * b.blinks;
      m.nextBlink = Math.random() < 0.12 ? t + 0.3 : t + gap * (0.5 + Math.random());
    }
    const u = (t - m.blinkAt) / 0.18;
    const blink = u < 0 || u > 1 ? 1 : u < 0.4 ? 1 - u / 0.4 : (u - 0.4) / 0.6;

    if (b.nudge && t > m.nudgeAt) {
      m.jv += (Math.random() < 0.5 ? -1 : 1) * 1.6;
      m.nudgeAt = t + b.nudge * (0.7 + Math.random() * 0.6);
    }
    m.jv += (-170 * m.jr - 7 * m.jv) * dt;
    m.jr += m.jv * dt;
    m.jsv += (-200 * m.js - 9 * m.jsv) * dt;
    m.js += m.jsv * dt;

    const breath = Math.sin((TAU * t) / breathe + phase);
    const swing = Math.sin((TAU * t) / (breathe * 1.6) + phase * 1.7);
    const body = bodyAt(face, a.state, t);
    return {
      phase: Math.floor(t * BOIL_FPS + m.offset * 7),
      rot: ((sway * b.sway * Math.PI) / 180) * swing + m.jr * 0.06 + body.rot,
      sx: 1 - 0.008 * breath - m.js * 0.04,
      sy: 1 + 0.012 * breath + m.js * 0.06,
      ty: -1.5 * breath + body.ty,
      look: m.look,
      blink: blink * b.open,
      spin: t * 2.4,
      t,
    };
  }
}

let stage: Stage | null = null;

export function getStage(): Stage {
  stage ??= new Stage();
  return stage;
}
