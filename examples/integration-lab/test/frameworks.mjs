import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { withChrome } from '../../../scripts/lib/chrome.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const reports = join(root, 'reports'); mkdirSync(reports, { recursive: true });
const fixtures = [
  { kind: 'next', build: ['next/dist/bin/next', 'build'], start: ['next/dist/bin/next','start','--port','3431'], port:3431 },
  { kind: 'astro', localModules: true, build: ['astro/bin/astro.mjs','build'], startLocal: 'dist/server/entry.mjs', port:3432 },
  { kind: 'nuxt', build: ['nuxt/bin/nuxt.mjs','build'], startLocal: '.output/server/index.mjs', port:3433 },
  { kind: 'sveltekit', build: ['vite/bin/vite.js','build'], startLocal: 'build/index.js', port:3434 },
];
const results=[];
for(const fixture of fixtures) {
  const {kind,port}=fixture;
  const cwd=join(root,'test','fixtures',kind);
  const fd=openSync(join(reports,`${kind}.log`),'w');
  let server;
  try {
    const builder=spawn(process.execPath,[join(fixture.localModules ? cwd : root,'node_modules',fixture.build[0]),...fixture.build.slice(1)],{cwd,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1',NUXT_TELEMETRY_DISABLED:'1',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore',fd,fd]});
    const timer=setTimeout(()=>builder.kill(),120000);
    const code=await new Promise((resolve,reject)=>{builder.once('exit',resolve);builder.once('error',reject)});clearTimeout(timer);
    assert.equal(code,0,`${kind} build failed; see reports/${kind}.log`);
    const args=fixture.startLocal?[join(cwd,fixture.startLocal)]:[join(root,'node_modules',fixture.start[0]),...fixture.start.slice(1)];
    server=spawn(process.execPath,args,{cwd,env:{...process.env,HOST:'127.0.0.1',HOSTNAME:'127.0.0.1',PORT:String(port),ORIGIN:`http://127.0.0.1:${port}`},stdio:['ignore',fd,fd]});
    const base=`http://127.0.0.1:${port}`;
    let html;
    for(let i=0;i<100;i++) {try {const res=await fetch(base);if(res.ok){html=await res.text();break}}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(html,`${kind} server did not start`);
    assert.match(html,/SSR specimen/,'server-rendered placeholder');
    const png=await fetch(`${base}/api/face?name=agent-47`);assert.equal(png.status,200);assert.equal(png.headers.get('content-type'),'image/png');
    assert.deepEqual([...new Uint8Array(await png.arrayBuffer()).slice(0,4)],[137,80,78,71]);
    assert.equal((await fetch(`${base}/api/face`)).status,400);
    const svg=await fetch(`${base}/api/face?name=agent-47&format=svg`);assert.equal(svg.status,200);assert.match(svg.headers.get('content-security-policy'),/default-src 'none'/);
    await withChrome(async({goto,evaluate,waitFor,errors})=>{
      await goto(base);
      const painted=`[...document.querySelectorAll('glorpie-face, [role="img"]')].filter(el=>{const c=el.shadowRoot?.querySelector('canvas')||el.querySelector('canvas');return c&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(v=>v>0)}).length`;
      await waitFor(`${painted} >= ${kind==='astro'?2:1}`,20000);
      const fingerprint=`(()=>{const el=document.querySelector('glorpie-face, [aria-label="SSR specimen"]');const c=el.shadowRoot?.querySelector('canvas')||el.querySelector('canvas');let h=0;for(const v of c.getContext('2d').getImageData(0,0,c.width,c.height).data)h=(Math.imul(h,31)+v)>>>0;return h})()`;
      if(kind!=='astro') {
        const before=await evaluate(fingerprint);await evaluate('document.querySelector("button").click()');
        await waitFor(`${fingerprint} !== ${before}`);
      }
      assert.deepEqual(errors,[],'no client or hydration errors');
    });
    results.push({integration:kind,status:'pass',checks:['production build','SSR placeholder','hydration and painting','reactive numeric-to-string seed update (except static Astro)','native PNG route','missing name rejection','SVG security headers']});
    console.log(`${kind}: production build, SSR, browser and image route passed`);
  } catch(error) {results.push({integration:kind,status:'fail',error:error.message});console.log(`FAIL ${kind}: ${error.message}`)}
  finally {server?.kill();closeSync(fd)}
}
writeFileSync(join(reports,'frameworks.json'),JSON.stringify({version:'glorpies@0.1.1',finishedAt:new Date().toISOString(),results},null,2)+'\n');
if(results.some(r=>r.status==='fail'))process.exitCode=1;
