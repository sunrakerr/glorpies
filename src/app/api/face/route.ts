import { faceRoute } from 'glorpies/server';

/** The demo image route, kept small: it's for trying urls out, and the CDN keeps every face it has painted. */
export const { GET } = faceRoute({ maxSize: 512, maxName: 128 });
