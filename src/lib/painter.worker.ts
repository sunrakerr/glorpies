import { setCanvasFactory } from 'glorpies/internal/canvas';
import { paintRaster, paintThumb, isCancelled, type Scheduled } from 'glorpies/internal/studio';
import { drawFrame, drawStill, isStill, type Painting } from 'glorpies/internal/face/render';
import type { Face } from 'glorpies/internal/face/types';
import { seedOf } from 'glorpies/internal/seed';
import { scriptedPose } from 'glorpies/internal/states';
import { marksFor } from 'glorpies/internal/looks';
import { drawMarks } from 'glorpies/internal/marks';
import type { FaceSettings, PaintMessage } from './face-worker';

setCanvasFactory({
  canvas: (w, h) => new OffscreenCanvas(w, h) as unknown as HTMLCanvasElement,
  path: () => new Path2D(),
});
type Actor = {
  canvas: OffscreenCanvas;
  settings?: FaceSettings;
  key?: string;
  visible: boolean;
  face?: Face;
  raster?: Painting;
  job?: Scheduled<unknown>;
  pointer?: { x: number; y: number; at: number; poke?: boolean };
};
const actors = new Map<number, Actor>();
const thumbs = new Map<number, Scheduled<unknown>>();
let timer: ReturnType<typeof setTimeout> | undefined;

function draw(actor: Actor) {
  if (!actor.face || !actor.raster || !actor.settings) return;
  const { face, raster, canvas, settings: s } = actor;
  const t = s.alive ? performance.now() / 1000 : 0;
  const pose = scriptedPose(face, s.state, t, 6 + (face.seed % 5));
  if (s.alive && actor.pointer && performance.now() - actor.pointer.at < 2600) {
    pose.look = { x: actor.pointer.x, y: actor.pointer.y };
    if (actor.pointer.poke && performance.now() - actor.pointer.at < 650) {
      const elapsed = (performance.now() - actor.pointer.at) / 1000;
      pose.rot += Math.sin(elapsed * 22) * Math.exp(-elapsed * 5) * 0.12;
    }
  }
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  if (isStill(raster)) drawStill(ctx, face, raster, pose, s.px);
  else drawFrame(ctx, face, raster, pose, s.px);
  const marks = marksFor(s.look, face, s.px);
  if (marks) drawMarks(ctx, face, s.state, marks, t, !s.alive);
}
function wake() {
  if (timer) return;
  const tick = () => {
    timer = undefined;
    let fps = 0;
    for (const actor of actors.values())
      if (actor.visible && actor.settings?.alive && actor.raster) {
        draw(actor);
        fps = Math.max(fps, actor.settings.fps);
      }
    if (fps) timer = setTimeout(tick, 1000 / fps);
  };
  timer = setTimeout(tick, 0);
}
addEventListener('message', (event: MessageEvent<PaintMessage>) => {
  const m = event.data;
  if (m.kind === 'attach') {
    actors.set(m.id, { canvas: m.canvas, visible: false });
    return;
  }
  if (m.kind === 'remove') {
    actors.get(m.id)?.job?.cancel();
    actors.delete(m.id);
    thumbs.get(m.id)?.cancel();
    thumbs.delete(m.id);
    return;
  }
  if (m.kind === 'thumb') {
    const job = paintThumb(m.seed, m.look, m.px);
    thumbs.set(m.id, job);
    job.promise.then(
      async (canvas) => {
        const bitmap = await createImageBitmap(canvas as unknown as OffscreenCanvas);
        if (thumbs.get(m.id) !== job) {
          bitmap.close();
          return;
        }
        thumbs.delete(m.id);
        postMessage({ id: m.id, bitmap }, { transfer: [bitmap] });
      },
      (error) => {
        if (!isCancelled(error)) postMessage({ id: m.id, error: String(error) });
      },
    );
    return;
  }
  const actor = actors.get(m.id);
  if (!actor) return;
  if (m.kind === 'visible') {
    actor.visible = m.visible;
    if (m.visible) {
      draw(actor);
      wake();
    }
    return;
  }
  if (m.kind === 'pointer') {
    actor.pointer = { ...m, at: performance.now() };
    wake();
    return;
  }
  actor.visible = m.visible;
  const key = JSON.stringify(m.settings);
  if (key === actor.key) {
    wake();
    return;
  }
  actor.key = key;
  actor.settings = m.settings;
  actor.job?.cancel();
  const s = m.settings;
  const job = paintRaster(seedOf(s.name), s.px, 3, {
    look: s.look,
    lively: s.alive,
    state: s.state,
    background: s.background,
    onError: (error) => postMessage({ id: m.id, error: String(error) }),
  });
  actor.job = job;
  job.promise.then(
    ({ face, raster }) => {
      if (actors.get(m.id) !== actor || actor.job !== job) return;
      actor.canvas.width = actor.canvas.height = s.px;
      actor.face = face;
      actor.raster = raster;
      draw(actor);
      wake();
      postMessage({ id: m.id, seed: seedOf(s.name), animated: s.alive });
    },
    (error) => {
      if (!isCancelled(error)) postMessage({ id: m.id, error: String(error) });
    },
  );
});
