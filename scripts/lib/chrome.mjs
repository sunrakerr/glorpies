// Headless Chrome over the DevTools protocol, for the scripts here. CHROME overrides the browser's path.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
}[process.platform] ?? 'google-chrome';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3417';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function within(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer().on('error', reject);
  server.listen(0, () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

async function firstPage(port) {
  for (;;) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
}

/**
 * Runs `task` with a fresh headless Chrome and closes it afterwards, however
 * the task ends. Every protocol call and wait has a deadline.
 */
export async function withChrome(task, { width = 1280, height = 900, timeout = 30_000 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'glorpies-chrome-'));
  const port = await freePort();
  const chrome = spawn(CHROME, ['--headless=new', `--window-size=${width},${height}`, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  const exited = new Promise((resolve) => chrome.once('exit', resolve));
  let socket;
  try {
    const page = await within(firstPage(port), 15_000, 'starting Chrome');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await within(new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve);
      socket.addEventListener('error', reject);
    }), 5_000, 'connecting to Chrome');

    const pending = new Map();
    const listeners = new Set();
    const errors = [];
    let next = 0;
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return listeners.forEach((listen) => listen(message));
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call?.reject(new Error(`${call.method}: ${message.error.message}`));
      else call?.resolve(message.result);
    });
    listeners.add(({ method, params }) => {
      if (method === 'Runtime.exceptionThrown') errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    });

    const send = (method, params = {}) => within(new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject, method });
      socket.send(JSON.stringify({ id, method, params }));
    }), timeout, method);

    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result?.value;
    };

    const waitFor = async (expression, ms = timeout) => {
      const start = Date.now();
      while (!(await evaluate(expression).catch(() => false))) {
        if (Date.now() - start > ms) throw new Error(`timed out waiting for ${expression}`);
        await sleep(100);
      }
    };

    const goto = async (url) => {
      await send('Page.navigate', { url });
      await waitFor(`document.readyState === 'complete' && document.fonts.status === 'loaded'`);
    };

    const screenshot = async (params = {}) => Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...params })).data, 'base64');

    await send('Page.enable');
    await send('Runtime.enable');
    return await task({ send, evaluate, waitFor, goto, screenshot, errors, on: (listen) => listeners.add(listen) });
  } finally {
    socket?.close();
    chrome.kill();
    await within(exited, 5_000, 'closing Chrome').catch(() => {});
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
