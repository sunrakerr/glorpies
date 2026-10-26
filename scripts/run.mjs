// Drives headless Chrome over CDP to exercise the faces app end to end.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync, statSync, readFileSync } from 'node:fs';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL_ = `${process.env.BASE_URL ?? 'http://localhost:3417'}/gallery`;
const DL = '/tmp/faces-e2e/downloads';
rmSync(DL, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--window-size=1280,900', '--user-data-dir=/tmp/faces-e2e/profile', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); if (targets.length) break; } catch {}
  await sleep(200);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: new URL(URL_).origin });
await send('Page.navigate', { url: URL_ });

const out = {};
const t0 = Date.now();
await evaluate(`new Promise(r => { const f = () => document.querySelectorAll('ul canvas.opacity-100').length >= 12 ? r() : setTimeout(f, 100); f(); })`);
out.allPaintedMs = Date.now() - t0;

out.frames = await evaluate(`(async () => {
  const tasks = []; const po = new PerformanceObserver(l => l.getEntries().forEach(e => tasks.push(Math.round(e.duration))));
  po.observe({ type: 'longtask' });
  const t0 = performance.now(); let n = 0;
  await new Promise(r => { const f = () => { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); });
  po.disconnect();
  return { rafPerSec: Math.round(n / 3), longTasks: tasks.length, worst: Math.max(0, ...tasks) };
})()`);

// pixels change between frames when alive
out.animates = await evaluate(`(async () => {
  const c = document.querySelector('ul canvas'); const a = c.toDataURL(); await new Promise(r => setTimeout(r, 400)); return a !== c.toDataURL();
})()`);

await shot('/tmp/faces-e2e/gallery.png');

// open the viewer on the second face
await evaluate(`document.querySelectorAll('ul li button[aria-label^="Open "]')[1].click()`);
await evaluate(`new Promise(r => { const f = () => document.querySelector('dialog[open] canvas.opacity-100') ? r() : setTimeout(f, 100); f(); })`);
await sleep(800);
await shot('/tmp/faces-e2e/viewer.png');
out.viewerCanvasPx = await evaluate(`document.querySelector('dialog[open] canvas').width`);

const clickText = (label) => evaluate(`[...document.querySelectorAll('dialog[open] button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
const toastSays = (text) => evaluate(`new Promise((r) => { const seen = []; const t0 = Date.now(); const f = () => { const s = document.querySelector('dialog[open] [aria-live]')?.textContent || ''; if (seen[seen.length - 1] !== s) seen.push(s); if (s.includes(${JSON.stringify(text)}) || Date.now() - t0 > 20000) r(seen.join(' → ')); else setTimeout(f, 50); }; f(); })`);

await clickText('PNG');
out.pngToast = await toastSays('PNG saved');
await clickText('SVG');
out.svgToast = await toastSays('SVG saved');
await sleep(800);
out.downloads = readdirSync(DL).map((f) => ({ f, kb: Math.round(statSync(`${DL}/${f}`).size / 1024) }));

await clickText('Copy image');
out.copyToast = await toastSays('Copied');
out.clipboard = await evaluate(`navigator.clipboard.read().then(items => items.flatMap(i => i.types))`);

await clickText('Copy SVG');
out.copySvgToast = await toastSays('SVG markup copied');
out.clipboardSvgHead = await evaluate(`navigator.clipboard.readText().then(t => t.slice(0, 60) + ' … ' + Math.round(t.length / 1024) + 'KB')`);

// keyboard: next face then close
await evaluate(`document.querySelector('dialog[open]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
await sleep(300);
out.counterAfterNext = await evaluate(`document.querySelector('dialog[open] .tabular-nums').textContent`);
await evaluate(`document.querySelector('dialog[open] button[aria-label=Close]').click()`);
await sleep(300);
out.dialogClosed = await evaluate(`!document.querySelector('dialog[open]')`);

// responsive: phone width
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(1500);
await evaluate(`window.scrollTo(0, 0)`);
await sleep(500);
await shot('/tmp/faces-e2e/phone.png');
out.phoneColumns = await evaluate(`getComputedStyle(document.querySelector('main ul')).gridTemplateColumns.split(' ').length`);

console.log(JSON.stringify(out, null, 2));
ws.close();
chrome.kill();
process.exit(0);
