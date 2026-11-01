import { DEFAULTS, optionsForElement, VERSION } from './shared.js';
import { mount, faceCanvas, faceSVG, faceColors, seedOf, setCanvasFactory } from 'glorpies';

const CDN_URL = import.meta.env.VITE_GLORPIES_CDN || `https://unpkg.com/glorpies@${VERSION}`;
const kind = new URLSearchParams(location.search).get('integration') || 'react';
const stage = document.getElementById('stage');
const errors = [];
let props = { ...DEFAULTS, className: '' };
let instance;
const report = (error) => {
  errors.push(String(error?.message ?? error));
  parent.postMessage({ type: 'glorpies:error', integration: kind, error: errors.at(-1) }, location.origin);
};
window.addEventListener('error', (event) => report(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => { report(event.reason); event.preventDefault(); });

const loaders = {
  lit: () => import('./adapters/lit.js'),
  react: () => import('./adapters/react.jsx'), avatar: () => import('./adapters/react.jsx'),
  vue: () => import('./adapters/vue.js'), preact: () => import('./adapters/preact.js'),
  solid: () => import('./adapters/solid.js'), svelte: () => import('./adapters/svelte.js'),
  'svelte-action': () => import('./adapters/svelte.js'), angular: () => import('./adapters/angular.js'),
};

function sized(canvas, next) {
  const size = typeof next.size === 'number' ? `${next.size}px` : next.size;
  Object.assign(canvas.style, { width: size, height: size });
  canvas.className = next.className || '';
  canvas.setAttribute('aria-label', next.label || 'Avatar');
}

async function start() {
  if (loaders[kind]) return (await loaders[kind]()).start(stage, props, report, kind);
  if (kind === 'element' || kind === 'cdn') {
    if (kind === 'cdn') await import(/* @vite-ignore */ CDN_URL);
    else await import('glorpies/element');
    const el = document.createElement('glorpie-face');
    el.addEventListener('glorpie-error', (event) => { event.preventDefault(); report(event.detail); });
    const update = (next) => {
      for (const [key, value] of Object.entries(optionsForElement(next))) el[key] = value;
      el.className = next.className || '';
    };
    update(props); stage.append(el);
    return { update, destroy: () => el.remove() };
  }
  if (kind === 'mount') {
    const canvas = document.createElement('canvas'); sized(canvas, props); stage.append(canvas);
    const handle = mount(canvas, { ...props, onError: report, onPaint: () => canvas.dataset.ready = 'true' });
    return { update(next) { sized(canvas, next); handle.update(next); }, destroy: () => { handle.destroy(); canvas.remove(); }, poke: handle.poke };
  }
  if (kind === 'canvas' || kind === 'svg') {
    const update = (next) => {
      try {
        if (kind === 'canvas') { stage.replaceChildren(faceCanvas(next.name, next)); stage.firstChild.dataset.ready = 'true'; }
        else stage.innerHTML = faceSVG(next.name, next);
      } catch (e) { report(e); }
    };
    update(props);
    return { update, destroy: () => stage.replaceChildren() };
  }
  if (kind === 'image') {
    const image = new Image(); image.alt = props.label;
    image.onerror = () => report(new Error('Server image failed to load'));
    const update = (next) => {
      const query = new URLSearchParams(Object.entries(optionsForElement(next)).filter(([, value]) => value !== undefined));
      query.delete('alive'); query.delete('pokeable'); query.delete('label'); query.delete('priority');
      query.set('format', next.format || 'png');
      image.src = `/api/face?${query}`;
      image.alt = next.label; image.className = next.className || '';
    };
    update(props); stage.append(image);
    return { update, destroy: () => image.remove() };
  }
  throw new Error(`Unknown integration: ${kind}`);
}

function snapshot() {
  const host = stage.querySelector('glorpie-face, [role="img"], canvas, svg, img');
  if (!host) return { ready: false, errors: [...errors] };
  let canvas = host.shadowRoot?.querySelector('canvas') ?? host.querySelector('canvas') ?? (host.tagName === 'CANVAS' ? host : null);
  const image = stage.querySelector('img');
  if (image?.complete && image.naturalWidth) {
    canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
  }
  let signature = 0, painted = 0;
  if (canvas?.width && canvas?.height) {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) { signature = (Math.imul(signature ^ data[i], 16777619) ^ data[i + 1] ^ data[i + 2] ^ data[i + 3]) >>> 0; if (data[i + 3]) painted++; }
  }
  if (host.tagName === 'svg') { painted = 1; signature = host.outerHTML.length; }
  const css = getComputedStyle(host);
  const crop = kind === 'avatar' ? host.parentElement : host;
  const rect = crop.getBoundingClientRect();
  const ready = host.tagName === 'GLORPIE-FACE' ? host.hasAttribute('data-ready')
    : host.tagName === 'IMG' ? host.complete && host.naturalWidth > 0
    : painted > 0 && (!host.querySelector('canvas') || host.querySelector('canvas').style.opacity === '1');
  return {
    ready, kind, signature, painted, errors: [...errors], width: rect.width, height: rect.height,
    pixels: canvas ? [canvas.width, canvas.height] : null,
    background: css.backgroundColor, radius: getComputedStyle(crop).borderRadius, label: host.getAttribute('aria-label') || image?.alt,
    className: host.getAttribute('class'), attributes: Object.fromEntries([...host.attributes].map((a) => [a.name, a.value])),
    expectedBackground: faceColors(props.name).bg, seed: seedOf(props.name),
    photo: image ? { loaded: image.complete && image.naturalWidth > 0, src: image.getAttribute('src') } : null,
  };
}

window.lab = {
  kind, errors, snapshot, mount, version: VERSION, cdnSource: CDN_URL, props: () => ({ ...props }),
  setProps(next, reset = false) { props = { ...(reset ? DEFAULTS : props), ...next }; instance.update(props); },
  breakPainting() {
    if (kind === 'cdn') {
      const create = document.createElement.bind(document);
      document.createElement = (tag, ...args) => { if (tag === 'canvas') throw new Error('lab deliberate paint failure'); return create(tag, ...args); };
    } else setCanvasFactory({ canvas: () => { throw new Error('lab deliberate paint failure'); }, path: () => new Path2D() });
  },
  resetErrors() { errors.length = 0; },
  destroy() { const previous = instance; instance = null; return previous?.destroy(); },
  async remount(next = DEFAULTS) { await instance?.destroy(); stage.replaceChildren(); props = { ...DEFAULTS, ...next }; instance = await start(); },
  poke() { instance.poke?.(); (stage.querySelector('canvas') || stage.querySelector('glorpie-face')?.shadowRoot?.querySelector('canvas'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); },
};

try {
  instance = await start();
  window.lab.started = true;
  parent.postMessage({ type: 'glorpies:ready', integration: kind }, location.origin);
} catch (error) { report(error); }

window.addEventListener('message', (event) => {
  if (event.origin === location.origin && event.data?.type === 'glorpies:props') window.lab.setProps(event.data.props);
});
