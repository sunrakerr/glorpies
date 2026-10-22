// Usage: node frames.mjs <seed> <outDir> <times: "a,b,c" | "fps:30"> [format=jpeg]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const [seed, outDir, timesArg, format = 'jpeg'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
rmSync('/tmp/faces-e2e/frames-profile', { recursive: true, force: true });
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--window-size=1400,1000', '--remote-debugging-port=9335', '--user-data-dir=/tmp/faces-e2e/frames-profile', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:9335/json')).json(); if (targets.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; };
await send('Runtime.enable');
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('console.error', m.params.args.map((a) => a.value ?? a.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') console.log('exception', m.params.exceptionDetails.exception?.description); });
await send('Page.navigate', { url: `http://localhost:3417/how?seed=${seed}` });
const t0 = Date.now();
while (!(await evaluate('!!window.__explainer?.ready').catch(() => false))) { if (Date.now() - t0 > 60000) { console.log('timeout waiting for explainer'); process.exit(1); } await sleep(200); }
console.log('ready in', Date.now() - t0, 'ms');
// stop the page's own playback so it doesn't fight the recorder
await evaluate(`document.querySelector('[aria-label=Pause]')?.click(); true`);
await sleep(100);
const duration = await evaluate('window.__explainer.duration');
const times = timesArg.startsWith('fps:') ? Array.from({ length: Math.round(duration * Number(timesArg.slice(4))) }, (_, i) => i / Number(timesArg.slice(4))) : timesArg.split(',').map(Number);
const mime = format === 'png' ? 'image/png' : 'image/jpeg';
let slowest = 0;
for (const [i, t] of times.entries()) {
  const s = Date.now();
  const url = await evaluate(`(() => { const c = document.querySelector('canvas'); window.__explainer.draw(${t}); return c.toDataURL('${mime}', 0.93); })()`);
  slowest = Math.max(slowest, Date.now() - s);
  const name = timesArg.startsWith('fps:') ? `f${String(i).padStart(5, '0')}` : `t${t.toFixed(2)}`;
  writeFileSync(`${outDir}/${name}.${format === 'png' ? 'png' : 'jpg'}`, Buffer.from(url.split(',')[1], 'base64'));
  if (i % 150 === 0) console.log('frame', i, '/', times.length);
}
console.log('done', times.length, 'frames, duration', duration, 'slowest frame', slowest, 'ms');
ws.close(); chrome.kill(); process.exit(0);
