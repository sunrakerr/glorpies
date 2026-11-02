import type { LookId } from 'glorpies';
import type { FaceName } from 'glorpies';
import type { FaceState } from 'glorpies';

export type FaceSettings = {
  name: FaceName;
  look: LookId;
  state: FaceState;
  background: boolean;
  alive: boolean;
  px: number;
  fps: number;
};
export type PaintMessage =
  | { kind: 'attach'; id: number; canvas: OffscreenCanvas }
  | { kind: 'face'; id: number; settings: FaceSettings; visible: boolean }
  | { kind: 'visible'; id: number; visible: boolean }
  | { kind: 'pointer'; id: number; x: number; y: number; poke?: boolean }
  | { kind: 'thumb'; id: number; seed: number; look: LookId; px: number }
  | { kind: 'remove'; id: number };
type Reply = {
  id: number;
  bitmap?: ImageBitmap;
  error?: string;
  seed?: number;
  animated?: boolean;
};
let worker: Worker | null = null;
let nextId = 0;
const listeners = new Map<number, (message: Reply) => void>();

export const canPaintOffscreen = () =>
  typeof Worker === 'function' &&
  typeof OffscreenCanvas === 'function' &&
  'transferControlToOffscreen' in HTMLCanvasElement.prototype;

export function painter(receive: (message: Reply) => void) {
  if (!worker) {
    worker = new Worker(new URL('./painter.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const listener = listeners.get(event.data.id);
      if (listener) listener(event.data);
      else event.data.bitmap?.close();
    };
    worker.onerror = () => {
      for (const [id, listener] of listeners)
        listener({ id, error: 'The face painter could not start.' });
      listeners.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const endpoint = worker;
  const id = ++nextId;
  listeners.set(id, receive);
  const send = (message: PaintMessage, transfer: Transferable[] = []) =>
    endpoint.postMessage(message, transfer);
  return {
    id,
    send,
    dispose: () => {
      send({ kind: 'remove', id });
      listeners.delete(id);
    },
  };
}
