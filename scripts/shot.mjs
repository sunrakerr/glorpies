// Usage: node shot.mjs <out.png> [width] [height] [dpr] [script-to-run-before-shot]
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';

const [out, w = '1280', h = '800', dpr = '2', pre = ''] = process.argv.slice(2);
rmSync('/tmp/faces-e2e/shot-profile', { recursive: true, force: true });
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--window-size=${w},${h}`, `--force-device-scale-factor=${dpr}`, '--remote-debugging-port=9334', '--user-data-dir=/tmp/faces-e2e/shot-profile', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:9334/json')).json(); if (targets.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = (expression) => send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
await send('Page.navigate', { url: 'http://localhost:3417/' });
const ready = await evaluate(`new Promise(r => { const t0 = Date.now(); const f = () => { const n = document.querySelectorAll('ul canvas.opacity-100').length; n >= 12 || Date.now() - t0 > 20000 ? r(n) : setTimeout(f, 100); }; f(); })`);
console.log('painted', ready.result?.result?.value);
if (pre) await evaluate(pre);
await sleep(1500);
console.log('capturing');
const r = await send('Page.captureScreenshot', { format: 'png' });
console.log('captured');
writeFileSync(out, Buffer.from(r.result.data, 'base64'));
ws.close(); chrome.kill(); process.exit(0);
