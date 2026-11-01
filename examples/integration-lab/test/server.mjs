import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Hono } from 'hono';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { Glorpie } from 'glorpies/react';
import { LOOKS, STATES, SHAPES, seedOf, FACES, faceColors, faceCanvas, faceSVG, randomName, resolveLook, isLook, isShape, isState } from 'glorpies';
import { FORMATS, renderImage, createFaceHandler, nodeFaceHandler, faceRoute, animationFrames, faceGIF, useNativeCanvas } from 'glorpies/server';

const magic = { png: [137,80,78,71], jpeg: [255,216,255], webp: [82,73,70,70], gif: [71,73,70,56] };
const checkImage = ({ body, type }, format) => {
  assert.equal(type, `image/${format === 'svg' ? 'svg+xml' : format}`);
  if (format === 'svg') assert.match(body, /^<svg /);
  else assert.deepEqual([...body.slice(0, magic[format].length)], magic[format]);
};

export async function runServerChecks(check) {
  await useNativeCanvas();
  await check('core', 'name and seed boundaries', () => {
    for (const name of ['', ' ', '🙂', '\u0000', 'a'.repeat(4096), 0, 42, FACES-1, FACES, -1, 0.5, NaN, Infinity]) {
      const seed = seedOf(name);
      assert.ok(Number.isSafeInteger(seed) && seed >= 0 && seed < FACES);
      assert.equal(seedOf(name), seed);
      assert.ok(faceColors(name).bg);
    }
    assert.equal(seedOf(42), 42);
    assert.equal(randomName(() => 0), 'soggy-glorp');
    assert.equal(resolveLook('auto', 71), 'ink'); assert.equal(resolveLook('auto', 72), 'watercolour');
    assert.equal(isLook('bad'), false); assert.equal(isShape('bad'), false); assert.equal(isState('bad'), false);
  });
  for (const look of LOOKS) for (const format of FORMATS) await check('server', `${look.id} as ${format}`, async () => {
    checkImage(await renderImage('agent-47', { look: look.id, size: 48, format, loop: 1, fps: 4 }), format);
  });
  for (const state of STATES) for (const shape of SHAPES) for (const format of FORMATS) await check('server', `${state}/${shape}/${format}`, async () => {
    checkImage(await renderImage('agent-47', { look: 'ink', size: 32, state, shape, format, loop: 1, fps: 4 }), format);
  });
  for (const background of [true, false, '#ffe9a8', 'tomato', 'rgb(20, 40, 60)', 'hsl(220, 100%, 50%)', 'rgba(20,40,60,0.5)', 'transparent']) {
    for (const format of FORMATS) await check('server', `background ${background}/${format}`, async () => {
      checkImage(await renderImage('agent-47', { look: 'ink', size: 32, background, shape: 'circle', format, loop: 1, fps: 4 }), format);
    });
  }
  await check('core', 'canvas and SVG pictures', () => {
    for (const size of [1, 16, 71, 72, 128]) {
      const canvas = faceCanvas('agent-47', { size, look: 'ink' });
      assert.equal(canvas.width, size); assert.equal(canvas.height, size);
      assert.match(faceSVG('agent-47', { size }), new RegExp(`width="${size}"`));
    }
    const svg = faceSVG('"/><script>alert(1)</script>', { size: 16 });
    assert.ok(!svg.includes('<script>'));
  });
  await check('server', 'direct animation exports', async () => {
    const frames = await animationFrames('agent-47', { size: 32, look: 'ink', fps: 4, loop: 1 });
    assert.equal(frames.frames.length, 4); assert.equal(frames.frames[0].length, 32*32*4);
    assert.equal(Buffer.from((await faceGIF('agent-47', { size: 32, look: 'ink', loop: 1, fps: 4 })).slice(0,3)).toString(), 'GIF');
  });
  for (const options of [{ size: 0 }, { size: -1 }, { size: NaN }, { size: Infinity }, { size: 8193 }, { look: 'bad' }, { state: 'bad' }, { shape: 'bad' }, { background: 'url(https://example.invalid/test)' }]) {
    await check('server', `reject invalid ${JSON.stringify(options)}`, async () => assert.rejects(() => renderImage('agent-47', options)));
  }
  const handler = createFaceHandler({ look: 'ink', size: 32, maxSize: 64, maxName: 12 });
  const request = (query) => handler(new Request('http://localhost/api/face?'+query));
  for (const [query, status] of [['',400], ['name=',400], ['name='+ 'a'.repeat(13),414], ['name=ok',200], ['name=ok&size=-1',200], ['name=ok&size=Infinity',200], ['name=ok&size=999999999',200], ['name=ok&look=bad&state=bad&shape=bad&format=bad',200]]) {
    await check('route', query.slice(0,70) || 'missing name', async () => {
      const response = await request(query); assert.equal(response.status,status);
      if (status===200) {
        const body=Buffer.from(await response.arrayBuffer());
        assert.ok(body.readUInt32BE(16)<=64);
        assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
        assert.match(response.headers.get('cache-control'),/31536000/);
      }
    });
  }
  await check('route','SVG CSP, GIF limits and custom cache',async()=>{
    const svg=await request('name=ok&format=svg');assert.match(svg.headers.get('content-security-policy'),/default-src 'none'/);
    const gif=await createFaceHandler({look:'ink'})(new Request('http://x/?name=ok&size=1024&format=gif&loop=1&fps=4'));
    const body=Buffer.from(await gif.arrayBuffer());assert.equal(body.readUInt16LE(6),320);
    const noCache=await createFaceHandler({look:'ink',size:16,cacheControl:null})(new Request('http://x/?name=ok'));
    assert.equal(noCache.headers.get('cache-control'),null);
  });
  await check('react SSR','all public component options',()=>{
    const html=renderToString(React.createElement(Glorpie,{name:42,size:'3rem',look:'ink',background:'#ffe9a8',state:'done',shape:'rounded',alive:false,pokeable:true,label:'Accessible 🙂',priority:5,className:'ssr-case',style:{border:'1px solid red'},onError:()=>{}}));
    assert.match(html,/width:3rem/);assert.match(html,/aria-label="Accessible 🙂"/);assert.match(html,/ssr-case/);assert.match(html,/<canvas/);
  });

  const servers=[];
  const native=createServer(nodeFaceHandler({look:'ink',size:32}));servers.push(native);
  const app=express();app.get('/api/face',nodeFaceHandler({look:'ink',size:32}));
  const expressServer=createServer(app);servers.push(expressServer);
  try {
    for(const [index,server] of servers.entries()) await check(index===0?'node:http':'express','real image request',async()=>{
      await new Promise(r=>server.listen(0,'127.0.0.1',r));
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api/face?name=ok`);
      assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0,4)],magic.png);
    });
    await check('hono','fetch adapter',async()=>{
      const hono=new Hono();hono.get('/api/face',c=>handler(c.req.raw));
      assert.equal((await hono.request('/api/face?name=ok')).status,200);
    });
    await check('next route','faceRoute GET contract',async()=>{
      const {GET}=faceRoute({look:'ink',size:32});assert.equal((await GET(new Request('http://x/?name=ok'))).status,200);
    });
    await check('sveltekit/astro route','request context adapter',async()=>{
      const GET=({request})=>handler(request);assert.equal((await GET({request:new Request('http://x/?name=ok')})).status,200);
    });
    await check('nuxt route','web Request adapter',async()=>{
      const handle=(event)=>handler(event.request);assert.equal((await handle({request:new Request('http://x/?name=ok')})).status,200);
    });
  } finally { for(const server of servers){server.closeAllConnections();server.close();} }

  const cli=fileURLToPath(new URL('../node_modules/glorpies/dist/cli.js',import.meta.url));
  const dir=mkdtempSync(join(tmpdir(),'glorpies-cli-'));
  const run=(args)=>spawnSync(process.execPath,[cli,...args],{cwd:dir});
  try {
    for(const format of FORMATS) await check('CLI',`all flags / ${format}`,()=>{
      const r=run(['two word name','--look','ink','--size','32','--state','done','--shape','circle','--background','ffe9a8','--loop','1','--format',format,'--out','-']);
      assert.equal(r.status,0,r.stderr.toString());
      checkImage({body:format==='svg'?r.stdout.toString():r.stdout,type:`image/${format==='svg'?'svg+xml':format}`},format);
    });
    for(const args of [[],['x','--look','bad'],['x','--size','NaN'],['x','--size','0'],['x','--size','4097'],['x','--state','bad'],['x','--shape','bad'],['x','--format','bad'],['x','--loop','11'],['x','--background','not-a-colour']]) {
      await check('CLI',`invalid ${args.join(' ')}`,()=>assert.notEqual(run(args).status,0));
    }
    await check('CLI','help, inferred format and overwrite protection',()=>{
      assert.equal(run(['--help']).status,0);
      const args=['agent-47','--look','ink','--size','32','--out','face.webp'];
      assert.equal(run(args).status,0);assert.notEqual(run(args).status,0);assert.equal(run([...args,'--force']).status,0);
      assert.deepEqual([...readFileSync(join(dir,'face.webp')).slice(0,4)],magic.webp);
    });
  } finally {rmSync(dir,{recursive:true,force:true});}
}
