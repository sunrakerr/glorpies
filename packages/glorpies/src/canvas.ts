/**
 * Where canvases and paths come from: the DOM's in a browser, a native implementation on a server.
 * No renderer reaches for the DOM directly.
 */
export type CanvasFactory = {
  canvas(w: number, h: number): HTMLCanvasElement;
  path(): Path2D;
};

const browser: CanvasFactory = {
  canvas: (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  },
  path: () => new Path2D(),
};

let factory: CanvasFactory = browser;

export function setCanvasFactory(f: CanvasFactory) {
  factory = f;
}

export function makeCanvas(w: number, h = w): HTMLCanvasElement {
  return factory.canvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

export function makePath(): Path2D {
  return factory.path();
}
