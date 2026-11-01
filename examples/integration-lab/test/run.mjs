import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { LOOKS, STATES, SHAPES } from 'glorpies';
import { withChrome } from '../../../scripts/lib/chrome.mjs';
import { runMountChecks } from './mount.mjs';
import { runServerChecks } from './server.mjs';

const installed = JSON.parse(readFileSync(new URL('../node_modules/glorpies/package.json', import.meta.url)));
const locked = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url))).packages['node_modules/glorpies'];
const results = [];
const check = async (integration, name, task) => {
  const started = Date.now();
  try {
    const detail = await task();
    results.push({ integration, name, status: 'pass', ms: Date.now() - started, detail });
  } catch (error) {
    results.push({ integration, name, status: 'fail', ms: Date.now() - started, error: error.message });
    console.log(`FAIL ${integration}: ${name}: ${error.message}`);
  }
};

const server = await preview({ root: fileURLToPath(new URL('..', import.meta.url)), preview: { host: '127.0.0.1', port: 0 } });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const kinds = ['react', 'vue', 'svelte', 'solid', 'preact', 'element', 'angular', 'mount', 'svelte-action', 'canvas', 'svg', 'avatar', 'lit', 'image', 'cdn'];
const components = new Set(['react', 'vue', 'svelte', 'solid', 'preact', 'element', 'angular', 'avatar', 'lit', 'cdn']);
const animated = new Set([...components, 'mount', 'svelte-action']);
const baseline = {};

try {
  await withChrome(async (page) => {
    const { goto, evaluate, waitFor, send } = page;
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
    for (const kind of kinds.filter(kind => !process.env.LAB_KINDS || process.env.LAB_KINDS.split(',').includes(kind))) {
      let started = false;
      await check(kind, 'initial render from npm', async () => {
        await goto(`${base}/case.html?integration=${kind}`);
        await waitFor('window.lab?.started && window.lab.snapshot().ready', 15000);
        const s = await evaluate('window.lab.snapshot()');
        assert.deepEqual(s.errors, []);
        assert.ok(s.painted > 0);
        started = true;
        return { width: s.width, pixels: s.pixels, cdnSource: kind === 'cdn' ? await evaluate('window.lab.cdnSource') : undefined };
      });
      if (!started) continue;
      const apply = async (props, { reset = true, changed = false } = {}) => {
        const before = await evaluate('window.lab.snapshot().signature');
        await evaluate(`window.lab.setProps(${JSON.stringify({ size: 96, ...props })}, ${reset})`);
        await evaluate('new Promise(r => setTimeout(r, 150))');
        await waitFor(`window.lab.snapshot().ready ${changed ? `&& window.lab.snapshot().signature !== ${before}` : ''}`, 10000);
        // React leaves the previous canvas visible while its next painting is scheduled.
        await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
        return evaluate('window.lab.snapshot()');
      };

      // Let CSS sizing settle before comparing backing-store pixels across frameworks.
      await evaluate('window.lab.setProps({size:96})');
      await evaluate('new Promise(r => setTimeout(r, 300))');
      await check(kind, 'string identity matches other components', async () => {
        const s = await apply({ name: 'agent-47', look: 'ink', background: false }, { changed: true });
        if (components.has(kind)) {
          if (baseline.string === undefined) baseline.string = s.signature;
          assert.equal(s.signature, baseline.string);
        }
      });
      if (components.has(kind)) await check(kind, 'numeric seed identity matches React', async () => {
        const s = await apply({ name: 42, look: 'ink', background: false }, { changed: true });
        if (baseline.numeric === undefined) baseline.numeric = s.signature;
        assert.equal(s.signature, baseline.numeric, 'numeric seeds must draw the same face in every framework');
      });
      if (components.has(kind)) for (const name of ['42', 0, 9007199254740991, -1, 0.5, 42]) await check(kind, `seed transition ${typeof name} ${name}`, async () => {
        const s = await apply({ name, look: 'ink', background: false });
        const key = typeof name + ':' + name;
        if (baseline[key] === undefined) baseline[key] = s.signature;
        assert.equal(s.signature, baseline[key]);
      });
      for (const name of [ ...(kind === 'image' ? [] : ['']), ' ', 'ünïcödé 🙂', '<script>alert(1)</script>', 'a'.repeat(256)]) {
        await check(kind, `name ${JSON.stringify(name.slice(0, 24))}`, async () => {
          const s = await apply({ name, look: 'ink' }, { changed: true });
          assert.ok(s.painted > 0);
          assert.equal(await evaluate('document.querySelectorAll("script:not([src])").length'), 0);
        });
      }
      for (const look of LOOKS) await check(kind, `look ${look.id}`, async () => {
        const previous = await evaluate('window.lab.props().look');
        const s = await apply({ look: look.id }, { changed: previous !== look.id });
        assert.ok(s.painted > 0);
      });
      for (const state of STATES) await check(kind, `state ${state}`, async () => {
        const s = await apply({ look: 'ink', state }, { changed: true });
        assert.ok(s.painted > 0);
      });
      if (components.has(kind)) {
        for (const shape of SHAPES) await check(kind, `shape ${shape}`, async () => {
          const s = await apply({ shape, look: 'ink' });
          assert.ok(s.width === 96 && s.height === 96);
          assert.ok(shape === 'square' ? s.radius === '0px' : s.radius !== '0px');
        });
        for (const [background, colour] of [[false, 'rgba(0, 0, 0, 0)'], ['#ffe9a8', 'rgb(255, 233, 168)'], ['tomato', 'rgb(255, 99, 71)'], ['rgb(20, 40, 60)', 'rgb(20, 40, 60)'], ['transparent', 'rgba(0, 0, 0, 0)']]) {
          await check(kind, `background ${background}`, async () => {
            const s = await apply({ background, look: 'ink' });
            assert.equal(s.background, colour);
            if (background === false && kind !== 'avatar') assert.equal(s.radius, '0px');
          });
        }
        for (const size of [16, 48, 71, 72, 73, 128, '3rem']) await check(kind, `size ${size}`, async () => {
          const expected = size === '3rem' ? 48 : size;
          await apply({ size, look: 'auto' });
          await waitFor(`window.lab.snapshot().width === ${expected} && window.lab.snapshot().pixels?.[0] >= ${expected}/1.15`);
          const s = await evaluate('window.lab.snapshot()');
          assert.equal(s.height, expected);
        });
        await check(kind, 'accessible label, class and priority', async () => {
          const s = await apply({ label: 'Guest 🙂', className: 'test-specimen', priority: 9, look: 'ink' });
          assert.equal(s.label, 'Guest 🙂');
          assert.ok(s.className?.includes('test-specimen'));
          if (s.attributes.name !== undefined) assert.equal(s.attributes.priority, '9');
        });
      }
      if (animated.has(kind)) {
        await check(kind, 'alive false is still', async () => {
          await apply({ look: 'ink', alive: false });
          await evaluate('new Promise(r => setTimeout(r, 200))');
          const a = await evaluate('window.lab.snapshot().signature');
          await evaluate('new Promise(r => setTimeout(r, 160))');
          assert.equal(await evaluate('window.lab.snapshot().signature'), a);
        });
        await check(kind, 'default alive honours reduced motion', async () => {
          await apply({ look:'ink',alive:false });
          await evaluate('window.lab.setProps({alive:undefined})');
          await evaluate('new Promise(r=>setTimeout(r,200))');
          const still = await evaluate('window.lab.snapshot().signature');
          await evaluate('new Promise(r=>setTimeout(r,160))');
          assert.equal(await evaluate('window.lab.snapshot().signature'),still);
        });
        await check(kind, 'alive true overrides reduced motion', async () => {
          await apply({ look: 'ink', alive: true });
          const before = await evaluate('window.lab.snapshot().signature');
          await waitFor(`window.lab.snapshot().signature !== ${before}`, 5000);
        });
        await check(kind, 'rapid updates settle on the final face', async () => {
          await evaluate(`{ for (let i=0;i<12;i++) window.lab.setProps({name:'rapid-'+i,look:'ink',alive:false}); window.lab.setProps({name:'final-face',label:'Final face'}); }`);
          await waitFor('window.lab.snapshot().ready');
          assert.equal(await evaluate('window.lab.props().name'), 'final-face');
        });
        await check(kind, 'unmount and remount', async () => {
          await evaluate('window.lab.destroy()');
          await evaluate('window.lab.remount()');
          await waitFor('window.lab.snapshot().ready');
          assert.deepEqual(await evaluate('window.lab.errors'), []);
        });
      }
      if (animated.has(kind)) await check(kind, 'high-DPI rendering', async () => {
        try {
          await send('Emulation.setDeviceMetricsOverride',{width:900,height:700,deviceScaleFactor:2,mobile:false});
          await evaluate("window.lab.remount({size:96,look:'ink',alive:false})");
          await waitFor('window.lab.snapshot().ready && window.lab.snapshot().pixels?.[0] >= 192 / 1.15');
        } finally {
          await send('Emulation.setDeviceMetricsOverride',{width:900,height:700,deviceScaleFactor:1,mobile:false});
          await evaluate('window.lab.remount()');
          await waitFor('window.lab.snapshot().ready');
        }
      });
      if (kind === 'image') {
        await check(kind,'empty name is rejected by the route',async()=>assert.equal(await evaluate("fetch('/api/face?name=').then(r=>r.status)"),400));
        for(const format of ['png','jpeg','webp','svg','gif']) await check(kind,`image element ${format}`,async()=>{
          const s=await apply({name:'format-specimen',look:'ink',format});assert.ok(s.photo.loaded);
        });
      }
      if (kind === 'react') await check(kind, 'React style prop', async () => {
        await apply({ style: { border: '3px solid rgb(10, 20, 30)' } });
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('[role="img"]')).borderTopWidth`), '3px');
      });
      if (kind === 'avatar') {
        for (const photo of ['/photo.png', '/photo-delay.png', '/photo-missing.png', '']) await check(kind, `photo ${photo || 'empty'}`, async () => {
          await apply({ photo });
          if (photo && !photo.includes('missing')) await waitFor('window.lab.snapshot().photo?.loaded');
          else await waitFor('!!document.querySelector("[role=img] canvas")');
        });
      }
      if (kind === 'mount') await runMountChecks(check,page);
      if (animated.has(kind)) await check(kind, 'paint failure reaches the documented error callback', async () => {
        await evaluate("window.lab.breakPainting(); window.lab.setProps({name:'error-specimen-'+Math.random(),look:'ink',alive:false})");
        await waitFor("window.lab.errors.some(e=>e.includes('lab deliberate paint failure'))");
      });
      console.log(`${kind}: ${results.filter(r=>r.integration===kind&&r.status==='pass').length}/${results.filter(r=>r.integration===kind).length} passed`);
    }
  });
  if (!process.env.LAB_SKIP_SERVER) await runServerChecks(check);
} finally {
  server.httpServer.close();
  const report = { version: `glorpies@${installed.version}`, source: locked.resolved, platform: `${process.platform}-${process.arch}`, finishedAt: new Date().toISOString(), results };
  mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../reports/latest.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(`${results.filter(r=>r.status==='pass').length}/${results.length} integration checks passed`);
}
if (results.some(r=>r.status==='fail')) process.exitCode = 1;
