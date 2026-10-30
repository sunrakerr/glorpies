import { faceRoute } from 'glorpies/server';

const PARAMETERS = new Set(['name', 'look', 'size', 'shape', 'state', 'background', 'format', 'loop', 'fps']);
const GIF_LIMITS = { size: 128, loop: 3, fps: 12 };

const { GET: paint } = faceRoute({ maxSize: 512, maxName: 128 });

/**
 * The demo image route, kept cheap: it's for trying urls out. GIFs stay
 * avatar-sized, and a url with anything else in it is refused, so the CDN
 * paints each face once.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams;
  const unknown = [...query.keys()].find((key) => !PARAMETERS.has(key));
  if (unknown) return new Response(`Unknown parameter: ${unknown}`, { status: 400 });
  if (query.get('format') === 'gif') {
    for (const [key, most] of Object.entries(GIF_LIMITS)) {
      const asked = Number(query.get(key));
      if (query.has(key) && !(asked <= most)) query.set(key, String(most));
    }
    if (!query.has('size')) query.set('size', String(GIF_LIMITS.size));
  }
  return paint(new Request(url));
}
