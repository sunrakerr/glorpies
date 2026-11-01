import { drawBeam, drawShip, EMITTER, UNDERSIDE } from './ship';

/** A glorpie adrift. `beamed` once the ship's beam has it; `fade` runs from 1 down to gone. */
export type Glorp = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  age: number;
  face: CanvasImageSource;
  beamed: boolean;
  fade: number;
  dying: boolean;
};

/** The saucer: cruising to a point, or hovering with its beam on over a glorpie it chased. */
export type Ship = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  chasing: Glorp | null;
  hover: number;
  beam: number;
};

/** A pixel of exhaust, or of a glorpie arriving aboard. */
export type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; lit: boolean };

/** `pixel` is the ship's cell size in CSS pixels. */
export type Space = { width: number; height: number; pixel: number; ship: Ship; glorps: Glorp[]; sparks: Spark[] };

const TAU = Math.PI * 2;
/** Most glorpies afloat at once; past it, the oldest fade out. */
export const MOST = 42;
const CRUISE = 95;
const DRIFT = 12;
const DRAG = 0.5;
const MAX_SPEED = 320;
/** How far below the ship the beam reaches, and how long it hovers there. */
const BEAM = 175;
const HOVER = 2.6;

const SPREAD = 0.34;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function emptySpace(width: number, height: number): Space {
  const ship: Ship = { x: width * 0.75, y: height * 0.22, vx: 0, vy: 0, tx: width * 0.75, ty: height * 0.22, chasing: null, hover: 0, beam: 0 };
  return { width, height, pixel: pixelOf(width), ship, glorps: [], sparks: [] };
}

export function resize(space: Space, width: number, height: number) {
  Object.assign(space, { width, height, pixel: pixelOf(width) });
}

const pixelOf = (width: number) => (width < 640 ? 2 : 3);
const undersideOf = (space: Space) => space.ship.y + UNDERSIDE * space.pixel;

export function letIn(space: Space, face: CanvasImageSource, x: number, y: number, vx: number, vy: number) {
  const speed = Math.hypot(vx, vy);
  const cap = speed > MAX_SPEED ? MAX_SPEED / speed : 1;
  const a = Math.random() * TAU;
  space.glorps.push({
    x, y,
    vx: vx * cap + Math.cos(a) * DRIFT * 2,
    vy: vy * cap + Math.sin(a) * DRIFT * 2,
    size: (46 + Math.random() * 40) * clamp(space.width / 1100, 0.75, 1),
    angle: (Math.random() - 0.5) * 0.8,
    spin: (Math.random() - 0.5) * 0.9,
    age: 0,
    face,
    beamed: false,
    fade: 1,
    dying: false,
  });
  const alive = space.glorps.filter((g) => !g.dying);
  if (alive.length > MOST) alive[0]!.dying = true;
}

export function step(space: Space, dt: number, still: boolean) {
  const { ship } = space;
  if (!still) steer(space, dt);
  const drag = Math.exp(-DRAG * dt);
  const underside = undersideOf(space);
  const mouth = EMITTER * space.pixel;

  space.glorps = space.glorps.filter((g) => {
    g.age += dt;
    if (g.dying) g.fade -= dt * 1.8;
    if (g.fade <= 0) return false;
    if (still) return true;

    if (!g.beamed && !g.dying && ship.beam > 0.6) {
      const depth = g.y - underside;
      g.beamed = depth > 0 && depth < BEAM && Math.abs(g.x - ship.x) < mouth + depth * SPREAD;
    }
    if (g.beamed) {
      // drawn up into the beam, centred under the ship, and gone once it's aboard
      g.vx += (ship.x - g.x) * 4 * dt - g.vx * 3 * dt;
      g.vy += (-110 - g.vy) * 2.5 * dt;
      g.spin += dt * 2;
      if (Math.hypot(g.x - ship.x, g.y - underside) < 10) {
        burst(space, ship.x, underside);
        return false;
      }
    } else {
      g.vx *= drag;
      g.vy *= drag;
      const speed = Math.hypot(g.vx, g.vy);
      if (speed < DRIFT && speed > 0) {
        g.vx *= DRIFT / speed;
        g.vy *= DRIFT / speed;
      }
      g.spin *= Math.exp(-0.4 * dt);
    }
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.angle += g.spin * dt;
    wrap(g, space.width, space.height);
    return true;
  });

  if (!still) exhaust(space, dt);
  space.sparks = space.sparks.filter((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    return p.life > 0;
  });
}

/** A trail of pixels shed from under the ship while it's on the move. */
function exhaust(space: Space, dt: number) {
  const { ship, pixel } = space;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed < 25 || Math.random() > speed * dt * 0.35) return;
  space.sparks.push({
    x: ship.x + (Math.random() - 0.5) * EMITTER * 2 * pixel,
    y: undersideOf(space) - pixel,
    vx: -ship.vx * 0.25 + (Math.random() - 0.5) * 12,
    vy: -ship.vy * 0.25 + 18 + Math.random() * 14,
    life: 0.5 + Math.random() * 0.5,
    max: 1,
    lit: Math.random() < 0.6,
  });
}

/** A glorpie arriving aboard, in a spray of pixels. */
function burst(space: Space, x: number, y: number) {
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + Math.random() * Math.PI;
    const v = 40 + Math.random() * 70;
    space.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, life: 0.4 + Math.random() * 0.4, max: 0.8, lit: true });
  }
}

/** Off one edge and back in at the other, as if space went on. */
function wrap(g: Glorp, width: number, height: number) {
  const m = g.size;
  if (g.x < -m) g.x = width + m;
  else if (g.x > width + m) g.x = -m;
  if (g.y < -m) g.y = height + m;
  else if (g.y > height + m) g.y = -m;
}

function steer(space: Space, dt: number) {
  const { ship } = space;
  const chased = ship.chasing;
  if (chased && (chased.dying || !space.glorps.includes(chased))) ship.chasing = null;
  if (ship.hover > 0) {
    ship.hover -= dt;
    // it waits for whatever it's lifting before it moves on
    if (ship.hover <= 0 && space.glorps.some((g) => g.beamed)) ship.hover = 0.3;
    ship.beam = Math.min(1, ship.beam + dt * 2.5);
    ship.vx *= Math.exp(-4 * dt);
    ship.vy *= Math.exp(-4 * dt);
    if (ship.hover <= 0) pickTarget(space);
  } else {
    ship.beam = Math.max(0, ship.beam - dt * 3);
    // it follows its quarry, but never off the screen
    if (ship.chasing) {
      ship.tx = clamp(ship.chasing.x, 70, space.width - 70);
      ship.ty = clamp(ship.chasing.y - BEAM * 0.7, 50, space.height - 50);
    }
    const dx = ship.tx - ship.x, dy = ship.ty - ship.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 10) {
      if (ship.chasing) ship.hover = HOVER;
      else pickTarget(space);
    } else {
      const want = CRUISE * Math.min(1, distance / 90);
      ship.vx += ((dx / distance) * want - ship.vx) * 1.4 * dt;
      ship.vy += ((dy / distance) * want - ship.vy) * 1.4 * dt;
    }
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
}

/** Off after a glorpie, more often than not, or else somewhere new. */
function pickTarget(space: Space) {
  const { ship, width, height } = space;
  const free = space.glorps.filter((g) => !g.beamed && !g.dying && g.y > BEAM * 0.6);
  ship.chasing = free.length && Math.random() < 0.65 ? free[Math.floor(Math.random() * free.length)]! : null;
  ship.tx = clamp(90 + Math.random() * (width - 180), 70, width - 70);
  ship.ty = clamp(60 + Math.random() * height * 0.45, 50, height - 50);
}

export type Colours = { ink: string; paper: string; accent: string };

export function draw(g: CanvasRenderingContext2D, space: Space, t: number, c: Colours) {
  g.clearRect(0, 0, space.width, space.height);
  const { ship, pixel } = space;
  const bob = Math.round(Math.sin(t * 1.7) * 2);

  if (ship.beam > 0) drawBeam(g, ship.x, undersideOf(space) + bob, pixel, BEAM, SPREAD, ship.beam, t, c.accent);

  for (const b of space.glorps) {
    // it settles in rather than appearing, and shrinks as the beam takes it up
    let size = b.size * (1 - Math.exp(-b.age * 8));
    const rise = clamp((b.y - ship.y) / BEAM, 0.12, 1);
    if (b.beamed) size *= rise;
    g.save();
    g.globalAlpha = Math.min(1, b.age * 5) * b.fade;
    g.translate(b.x, b.y);
    g.rotate(b.angle);
    // the beam breaks it down into pixels on the way up
    if (b.beamed) drawPixelated(g, b.face, size, Math.round(4 + 24 * rise));
    else g.drawImage(b.face, -size / 2, -size / 2, size, size);
    g.restore();
  }

  for (const p of space.sparks) {
    g.globalAlpha = Math.ceil((p.life / p.max) * 3) / 3;
    g.fillStyle = p.lit ? c.accent : '#958ca8';
    g.fillRect(Math.round(p.x / pixel) * pixel, Math.round(p.y / pixel) * pixel, pixel, pixel);
  }
  g.globalAlpha = 1;

  drawShip(g, ship.x, ship.y + bob, pixel, { t, vx: ship.vx, beam: ship.beam });
}

let shrunk: HTMLCanvasElement | null = null;

/** A face drawn `cells` pixels across, then blown back up to `size` with the pixels showing. */
function drawPixelated(g: CanvasRenderingContext2D, face: CanvasImageSource, size: number, cells: number) {
  shrunk ??= document.createElement('canvas');
  shrunk.width = shrunk.height = cells;
  const s = shrunk.getContext('2d')!;
  s.drawImage(face, 0, 0, cells, cells);
  g.imageSmoothingEnabled = false;
  g.drawImage(shrunk, -size / 2, -size / 2, size, size);
  g.imageSmoothingEnabled = true;
}
