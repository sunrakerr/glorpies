// Optional smoke checks in Bun or Deno, against the installed registry package.
import assert from 'node:assert/strict';
const { renderImage, createFaceHandler, FORMATS } = await import(typeof Deno === 'undefined' ? 'glorpies/server' : 'npm:glorpies/server');

for (const format of FORMATS) {
  const image = await renderImage(42, { look: 'ink', size: 32, format, loop: 1, fps: 4 });
  assert.equal(image.type, `image/${format === 'svg' ? 'svg+xml' : format}`);
  if (format === 'svg') assert.match(image.body, /^<svg/);
  else assert.ok(image.body.byteLength > 100);
}
const handler = createFaceHandler({ look: 'ink', size: 32, maxSize: 64, maxName: 12 });
let server, port;
if (typeof Bun !== 'undefined') { server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handler }); port = server.port; }
else if (typeof Deno !== 'undefined') { server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, handler); port = server.addr.port; }
else throw new Error('Run this script with Bun or Deno.');
try {
  const url = `http://127.0.0.1:${port}`;
  const png = await fetch(url + '?name=runtime'); assert.equal(png.status, 200);
  assert.equal(png.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await png.arrayBuffer()).slice(0, 4)], [137, 80, 78, 71]);
  const svg = await fetch(url + '?name=runtime&format=svg'); assert.equal(svg.status, 200);
  assert.match(svg.headers.get('content-security-policy'), /default-src 'none'/); await svg.text();
  assert.equal((await fetch(url)).status, 400);
  assert.equal((await fetch(url + '?name=' + 'x'.repeat(13))).status, 414);
  console.log(JSON.stringify({ runtime: typeof Bun !== 'undefined' ? `Bun ${Bun.version}` : `Deno ${Deno.version.deno}`, formats: [...FORMATS], http: 'PNG, SVG, missing/oversized names passed' }));
} finally {
  if (typeof Bun !== 'undefined') await server.stop(true);
  else await server.shutdown();
}
