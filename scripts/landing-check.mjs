// Production-browser regressions for the website's worker renderer and motion lifecycle.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { withChrome, sleep } from './lib/chrome.mjs';
import { seedOf } from '../packages/glorpies/src/seed.ts';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3419';
const server = process.env.BASE_URL
  ? null
  : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3419'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
try {
  for (let attempt = 0; ; attempt++) {
    try {
      assert.equal((await fetch(base)).status, 200);
      break;
    } catch (error) {
      if (attempt === 120) throw error;
      await sleep(500);
    }
  }
  for (const mode of ['worker', 'reduced', 'fallback', 'worker-failure']) {
    await withChrome(async ({ send, goto, waitFor, evaluate, errors }) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await send('Emulation.setEmulatedMedia', {
        features: [
          {
            name: 'prefers-reduced-motion',
            value: mode === 'reduced' ? 'reduce' : 'no-preference',
          },
        ],
      });
      if (mode === 'fallback')
        await send('Page.addScriptToEvaluateOnNewDocument', {
          source: 'delete HTMLCanvasElement.prototype.transferControlToOffscreen;',
        });
      if (mode === 'worker-failure')
        await send('Page.addScriptToEvaluateOnNewDocument', {
          source: `window.Worker = class extends EventTarget { constructor() { super(); setTimeout(() => this.onerror?.(new Event('error')), 0); } postMessage() {} terminate() {} };`,
        });
      await goto(base);
      await waitFor('document.querySelectorAll(\'button[aria-label^="Try "]\').length === 98');
      assert.ok(
        await evaluate('document.querySelectorAll("canvas").length < 35'),
        'crowd stays cached',
      );
      // A crowd face is still a real control, and the worker must paint the selected seed.
      const picked = await evaluate(`(() => {
        const buttons = [...document.querySelectorAll('button[aria-label^="Try "]')];
        const button = buttons[49]; button.click(); return button.getAttribute('aria-label').slice(4);
      })()`);
      await waitFor(
        `document.querySelector('input[aria-label="Name"]').value === ${JSON.stringify(picked)}`,
      );
      await evaluate(`document.querySelector('#playground').scrollIntoView({behavior:'instant'})`);
      if (mode === 'fallback' || mode === 'worker-failure') {
        await waitFor(
          `(() => { const c = document.querySelector('#playground [role="img"] canvas'); return c?.style.opacity === '1' && c.width > 100; })()`,
        );
        await waitFor(
          `document.querySelector('#playground button[title] canvas')?.classList.contains('opacity-100')`,
        );
      } else {
        const portrait = `document.querySelector('#playground [role="img"]')`;
        await waitFor(`${portrait}?.dataset.seed === '${seedOf(picked)}'`);
        assert.equal(await evaluate(`${portrait}.dataset.animated`), String(mode !== 'reduced'));
        // Rapid prop changes must cancel stale paints instead of swapping an old seed back in.
        const name = 'worker regression 🌱';
        await evaluate(`(() => {
          const input = document.querySelector('input[aria-label="Name"]');
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          for (const value of ['first', 'second', ${JSON.stringify(name)}]) {
            set.call(input, value); input.dispatchEvent(new Event('input', {bubbles:true}));
          }
        })()`);
        await waitFor(`${portrait}?.dataset.seed === '${seedOf(name)}'`);
        for (const [flag, option] of [
          ['state', 'done'],
          ['background', 'false'],
          ['shape', 'square'],
          ['alive', 'false'],
        ]) {
          await evaluate(`(() => {
            const label = [...document.querySelectorAll('#playground span')].find(n => n.textContent === '--${flag}');
            [...label.parentElement.querySelectorAll('button')].find(n => n.textContent === '${option}').click();
          })()`);
        }
        await waitFor(`${portrait}.dataset.animated === 'false'`);
        assert.equal(await evaluate(`getComputedStyle(${portrait}).borderRadius`), '0px');
        // Offscreen headline must have no DOM writes; scrolling back resumes it.
        await sleep(300);
        await evaluate(
          `window.__mutations = 0; new MutationObserver(() => window.__mutations++).observe(document.querySelector('h1'), {subtree:true,childList:true,attributes:true,characterData:true});`,
        );
        await sleep(700);
        assert.equal(await evaluate('window.__mutations'), 0, 'offscreen headline pauses');
        await evaluate('scrollTo({top:0,behavior:"instant"})');
        if (mode === 'reduced') {
          await sleep(800);
          assert.equal(await evaluate('window.__mutations'), 0, 'reduced motion stays still');
        } else {
          // A paused headline may be in its intentional 2.8s hold.
          await waitFor('window.__mutations > 0', 8000);
        }
      }
      assert.deepEqual(errors, [], `${mode}: no browser errors`);
      console.log(`${mode}: crowd selection, portrait paint, motion and fallback passed`);
    });
  }
} finally {
  server?.kill();
}
