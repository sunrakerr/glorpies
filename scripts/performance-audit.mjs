// Repeatable cold-navigation Lighthouse medians plus a real-browser idle check.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withChrome, sleep } from './lib/chrome.mjs';

const [label = 'after', base = 'https://glorpies.sunrakerr.dev'] = process.argv.slice(2);
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error('Use a simple report label.');
const directory = resolve('media/performance', label);
mkdirSync(directory, { recursive: true });
const results = [];
for (const mode of ['mobile', 'desktop']) {
  for (let run = 1; run <= 3; run++) {
    const output = `${directory}/${mode}-${run}.json`;
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        [
          '--yes',
          'lighthouse@13.6.0',
          base,
          '--only-categories=performance',
          '--output=json',
          `--output-path=${output}`,
          '--quiet',
          '--chrome-flags=--headless=new --disable-dev-shm-usage --no-first-run',
          '--max-wait-for-load=60000',
          ...(mode === 'desktop' ? ['--preset=desktop'] : []),
        ],
        { stdio: 'inherit' },
      );
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`Lighthouse exited ${code}`)),
      );
    });
    const report = JSON.parse(readFileSync(output, 'utf8'));
    const a = report.audits;
    const row = {
      mode,
      run,
      score: Math.round(report.categories.performance.score * 100),
      tbt: a['total-blocking-time'].numericValue,
      tti: a.interactive.numericValue,
      lcp: a['largest-contentful-paint'].numericValue,
      cls: a['cumulative-layout-shift'].numericValue,
      longest: Math.max(0, ...a['long-tasks'].details.items.map((task) => task.duration)),
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}
const median = (values) => values.sort((a, b) => a - b)[1];
const medians = Object.fromEntries(
  ['mobile', 'desktop'].map((mode) => [
    mode,
    Object.fromEntries(
      ['score', 'tbt', 'tti', 'lcp', 'cls', 'longest'].map((key) => [
        key,
        median(results.filter((row) => row.mode === mode).map((row) => row[key])),
      ]),
    ),
  ]),
);
const idle = [];
for (const mode of ['mobile', 'desktop', 'reduced']) {
  await withChrome(async ({ send, goto, evaluate, screenshot }) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: mode === 'desktop' ? 1365 : 390,
      height: mode === 'desktop' ? 900 : 844,
      deviceScaleFactor: mode === 'desktop' ? 1 : 2,
      mobile: mode !== 'desktop',
    });
    await send('Emulation.setCPUThrottlingRate', { rate: mode === 'desktop' ? 1 : 4 });
    await send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-reduced-motion', value: mode === 'reduced' ? 'reduce' : 'no-preference' },
      ],
    });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__long=[];new PerformanceObserver(list=>window.__long.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});`,
    });
    await send('Performance.enable');
    await goto(base);
    await sleep(20_000);
    const metrics = () =>
      send('Performance.getMetrics').then((r) =>
        Object.fromEntries(r.metrics.map((m) => [m.name, m.value])),
      );
    const a = await metrics();
    await sleep(10_000);
    const b = await metrics();
    const details = await evaluate(
      `({canvas:document.querySelectorAll('canvas').length,longest:Math.max(0,...window.__long),longTasks:window.__long.filter(t=>t>200).length})`,
    );
    const row = {
      mode,
      idleBusyPercent:
        Math.round(((b.TaskDuration - a.TaskDuration) / (b.Timestamp - a.Timestamp)) * 1000) / 10,
      ...details,
    };
    idle.push(row);
    console.log(JSON.stringify(row));
    writeFileSync(`${directory}/${mode}.png`, await screenshot());
  });
}
writeFileSync(
  `${directory}/summary.json`,
  JSON.stringify({ url: base, lighthouse: '13.6.0', results, medians, idle }, null, 2) + '\n',
);
console.log('Medians:', JSON.stringify(medians));
