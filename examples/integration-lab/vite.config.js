import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nodeFaceHandler, createFaceHandler } from 'glorpies/server';

const faces = nodeFaceHandler();
const fetchFaces = createFaceHandler();
const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function middleware(server) {
  server.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/face') return faces(req, res);
    if (url.pathname === '/api/fetch-face') {
      const response = await fetchFaces(new Request(url));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    if (url.pathname === '/photo.png' || url.pathname === '/photo-delay.png') {
      if (url.pathname.includes('delay')) await new Promise((r) => setTimeout(r, 900));
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(photo);
    }
    if (url.pathname === '/photo-missing.png') return res.writeHead(404).end();
    if (url.pathname === '/api/report') {
      res.setHeader('Content-Type', 'application/json');
      try { res.end(readFileSync(new URL('./reports/latest.json', import.meta.url))); }
      catch { res.end('{"status":"not run","results":[]}'); }
      return;
    }
    next();
  });
}

export default defineConfig({
  plugins: [svelte(), { name: 'local-face-routes', configureServer: middleware, configurePreviewServer: middleware }],
  build: { rollupOptions: { input: { main: resolve('index.html'), case: resolve('case.html') } } },
});
