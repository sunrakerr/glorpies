import { faceGIF, type AnimationOptions } from './animate';
import { setCanvasFactory } from './canvas';
import { isLook, type LookChoice } from './looks';
import { isState } from './states';
import { faceCanvas, faceSVG, isShape } from './still';
import type { FaceName } from './seed';

/**
 * Faces as image files, on a server or anywhere else without a DOM: Node, Bun,
 * Deno and serverless functions. Drawing uses `@napi-rs/canvas` (install it
 * alongside fuglios); it's loaded the first time an image is asked for.
 */

export const FORMATS = ['png', 'webp', 'jpeg', 'svg', 'gif'] as const;
export type ImageFormat = (typeof FORMATS)[number];

export type ImageOptions = AnimationOptions & {
  format?: ImageFormat;
  /** 0–100 for webp and jpeg. */
  quality?: number;
};

const TYPES: Record<ImageFormat, string> = { png: 'image/png', webp: 'image/webp', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif' };

type NativeCanvas = { encode(format: 'png' | 'webp' | 'jpeg', quality?: number): Promise<Uint8Array> };

let native: Promise<void> | null = null;

/** Points every renderer at native canvases. Called for you by `renderImage`; call it yourself to draw with `faceCanvas` directly. */
export function useNativeCanvas(): Promise<void> {
  native ??= import('@napi-rs/canvas').then(
    (m) => {
      setCanvasFactory({
        canvas: (w, h) => m.createCanvas(w, h) as unknown as HTMLCanvasElement,
        path: () => new m.Path2D() as unknown as Path2D,
      });
    },
    () => {
      throw new Error('fuglios/server draws with @napi-rs/canvas; install it next to fuglios (npm i @napi-rs/canvas)');
    },
  );
  return native;
}

/** One face as an image file: its bytes (or SVG text) and content type. */
export async function renderImage(name: FaceName, o: ImageOptions = {}): Promise<{ body: Uint8Array | string; type: string }> {
  await useNativeCanvas();
  const format = o.format ?? 'png';
  if (format === 'svg') return { body: faceSVG(name, o), type: TYPES.svg };
  if (format === 'gif') return { body: faceGIF(name, o), type: TYPES.gif };
  // jpeg has no transparency to crop with, so it is always square
  const c = faceCanvas(name, format === 'jpeg' ? { ...o, shape: 'square' } : o) as unknown as NativeCanvas;
  return { body: await c.encode(format, o.quality ?? 90), type: TYPES[format] };
}

export type HandlerOptions = Partial<ImageOptions> & {
  /** Cache-Control for every image. The same request always gives the same image, so the default caches for a year. */
  cacheControl?: string | null;
  /** Largest size a request may ask for. */
  maxSize?: number;
  /** Longest name a request may ask for; a name is an id, not a document. */
  maxName?: number;
};

/** An SVG opened on its own runs no script and loads nothing but its own embedded pictures. */
const SVG_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

/**
 * A standard web request handler, `(Request) => Response`, so it mounts
 * anywhere that speaks fetch: Next.js route handlers, Remix, Hono, Bun.serve,
 * Deno.serve, Cloudflare-style workers that can load native modules.
 *
 *   GET /api/face?name=agent-47&look=ink&size=128&shape=circle&format=png
 *
 * Query: name (required), look, size, shape, state, format (png, webp, jpeg,
 * svg, gif), and for gif: loop (seconds), fps.
 */
export function createFaceHandler(defaults: HandlerOptions = {}): (request: Request) => Promise<Response> {
  const { cacheControl = 'public, max-age=31536000, immutable', maxSize = 1024, maxName = 256, ...base } = defaults;
  return async (request) => {
    const q = new URL(request.url).searchParams;
    const name = q.get('name');
    if (!name) return new Response('Missing ?name=', { status: 400 });
    if (name.length > maxName) return new Response(`?name= is longer than ${maxName} characters`, { status: 414 });
    const num = (k: string, fallback: number, lo: number, hi: number) => {
      const v = Number(q.get(k));
      return q.has(k) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
    };
    const look = q.get('look'), shape = q.get('shape'), state = q.get('state'), format = q.get('format');
    const o: ImageOptions = {
      ...base,
      look: look && (look === 'auto' || isLook(look)) ? (look as LookChoice) : base.look,
      shape: isShape(shape) ? shape : base.shape,
      state: isState(state) ? state : base.state,
      format: (FORMATS as readonly string[]).includes(format ?? '') ? (format as ImageFormat) : base.format,
      size: Math.round(num('size', base.size ?? 256, 16, maxSize)),
      loop: num('loop', base.loop ?? 3, 1, 8),
      fps: Math.round(num('fps', base.fps ?? 15, 4, 30)),
    };
    // an animation costs a frame per tick, so its size is kept to avatar scale (and its frames to FRAME_BUDGET)
    if (o.format === 'gif') o.size = Math.min(o.size!, 320);
    try {
      const { body, type } = await renderImage(name, o);
      const headers: Record<string, string> = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' };
      if (type === TYPES.svg) headers['Content-Security-Policy'] = SVG_CSP;
      if (cacheControl) headers['Cache-Control'] = cacheControl;
      return new Response(body as BodyInit, { headers });
    } catch (e) {
      // the details are for the server's log, not for whoever asked
      console.error('fuglios: could not paint', name, e);
      return new Response('Could not paint that face', { status: 500 });
    }
  };
}

/** The handler as a Next.js route: `export const { GET } = faceRoute();` in app/api/face/route.ts. */
export function faceRoute(defaults?: HandlerOptions) {
  return { GET: createFaceHandler(defaults) };
}

export { faceCanvas, faceSVG } from './still';
export { animationFrames, faceGIF, FRAME_BUDGET } from './animate';
