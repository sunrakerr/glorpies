// Usage: node styles.mjs <outDir> <px> <seed,seed,...> [style,style,...]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const [outDir, px, seedsArg, stylesArg] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
rmSync('/tmp/faces-e2e/avatars-profile', { recursive: true, force: true });
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1400,1000', '--remote-debugging-port=9337', '--user-data-dir=/tmp/faces-e2e/avatars-profile', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch('http://127.0.0.1:9337/json')).json(); if (targets.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') console.log('exception', m.params.exceptionDetails.exception?.description); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value; };
await send('Runtime.enable');
await send('Page.navigate', { url: `http://localhost:3417/lab/avatars?seeds=${seedsArg}` });
const t0 = Date.now();
while (!(await evaluate('!!window.__avatars').catch(() => false))) { if (Date.now() - t0 > 60000) { console.log('timeout'); process.exit(1); } await sleep(200); }
const styles = stylesArg ? stylesArg.split(',') : ['clay','comic','onebit','pixel','ascii','neon','bauhaus'];
for (const seed of seedsArg.split(',')) {
  for (const style of styles) {
    const s = Date.now();
    const url = await evaluate(`window.__avatars.render(${seed}, '${style}', ${px})`);
    writeFileSync(`${outDir}/${style}-${seed}.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(style, seed, Date.now() - s, 'ms');
  }
}
ws.close(); chrome.kill(); process.exit(0);
