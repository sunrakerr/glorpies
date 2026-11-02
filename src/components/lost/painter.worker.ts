import { faceCanvas, setCanvasFactory } from 'glorpies';

// no DOM in a worker: faces are painted on OffscreenCanvases and sent back as bitmaps
setCanvasFactory({
  canvas: (w, h) => new OffscreenCanvas(w, h) as unknown as HTMLCanvasElement,
  path: () => new Path2D(),
});

addEventListener('message', (e: MessageEvent<{ name: string; px: number }>) => {
  const face = faceCanvas(e.data.name, {
    look: 'watercolour',
    size: e.data.px,
    background: false,
  }) as unknown as OffscreenCanvas;
  const bitmap = face.transferToImageBitmap();
  postMessage(bitmap, { transfer: [bitmap] });
});
