// Draws the README's pictures with the site's own fonts and colours, and faces from the built library.
// Build the library and run the site first (pnpm --filter glorpies build; pnpm dev --port 3417), then: node scripts/readme-art.mjs [base-url]
// Add --hero-only to redraw just the README's single Glorpie, without the site or Chrome.
// Writes .github/assets/: glorpie.png, banner-{dark,light}.webp, looks-{dark,light}.webp and one GIF per state,
// mirrors README images to public/readme/ for npm, and writes the site's link preview, src/app/opengraph-image.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { nodeFaceHandler, renderImage } from '../packages/glorpies/dist/server.js';
import { BASE_URL, withChrome } from './lib/chrome.mjs';

const base = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? BASE_URL;
const out = new URL('../.github/assets/', import.meta.url);
const publicOut = new URL('../public/readme/', import.meta.url);
mkdirSync(out, { recursive: true });
mkdirSync(publicOut, { recursive: true });

function writeArt(file, bytes, to = out) {
  writeFileSync(new URL(file, to), bytes);
  if (to === out && /^(glorpie\.png|looks-|state-)/.test(file)) writeFileSync(new URL(file, publicOut), bytes);
}

const { body: hero } = await renderImage('sunrakerrisfriednoodlz', {
  look: 'watercolour', size: 512, format: 'png', shape: 'circle',
});
writeArt('glorpie.png', hero);
console.log('wrote glorpie.png');
if (process.argv.includes('--hero-only')) process.exit(0);

// the library's own image handler, on a port of its own for as long as this runs
const faces = createServer(nodeFaceHandler());
await new Promise((resolve) => faces.listen(0, '127.0.0.1', resolve));
const facesAt = `http://127.0.0.1:${faces.address().port}`;
const face = (name, o = {}) => `${facesAt}/?${new URLSearchParams({ name, format: 'png', ...o })}`;

/** The headline mid-transmission: English, then letters coming into focus as braille dots, then still alien. */
const HEADLINE = 'all hail the glorpies.';
const SETTLED = 15, DOTS = ['⣷', '⣶', '⣤'];
const alien = (ch) => String.fromCodePoint(0x2d30 + ((ch.charCodeAt(0) * 7) % 56));

const cell = (en, i) => {
  if (en === ' ') return '<span style="display:inline-block;width:0.45ch"></span>';
  if (i < SETTLED) return `<span style="display:inline-block;width:1ch;text-align:center">${en}</span>`;
  const dot = DOTS[i - SETTLED];
  const [ch, font, scale] = dot ? [dot, 'var(--font-braille)', 1] : [alien(en), 'var(--font-alien)', 0.92];
  return `<span style="position:relative;display:inline-block;width:1ch;text-align:center"><span style="visibility:hidden">${en}</span><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;line-height:1;color:var(--color-accent);font-family:${font};font-size:${scale}em">${ch}</span></span>`;
};

const invader = `<svg viewBox="0 0 11 8" shape-rendering="crispEdges" style="height:15px;fill:var(--color-accent)">${['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000']
  .flatMap((row, y) => [...row].map((on, x) => (on === '1' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')))
  .join('')}</svg>`;

const rule = 'height:1px;background:repeating-linear-gradient(90deg,currentColor 0 4px,transparent 4px 8px);color:color-mix(in oklab,var(--color-ink) 20%,transparent)';

/** Who's on the banner, and how each is shown. */
const CREW = [
  ['ada@lovelace.dev', { look: 'watercolour', shape: 'squircle' }],
  ['agent-47', { look: 'watercolour', background: 'false', state: 'thinking' }],
  ['soggy-glorp', { look: 'gouache', shape: 'circle' }],
  ['zorb-from-accounts', { look: 'watercolour', background: 'false' }],
  ['grace@hopper.dev', { look: 'sticker', shape: 'rounded', state: 'done' }],
  ['bot-9000', { look: 'watercolour', background: 'false', state: 'working' }],
  ['wobbly-quorb', { look: 'oil', shape: 'circle' }],
];

const banner = () => `
<div id="art" data-grain="1" style="width:1280px;height:640px;box-sizing:border-box;padding:44px 64px;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;background:var(--color-paper);color:var(--color-ink);font-family:var(--font-mono)">
  <div style="display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:12px">${invader}<span style="font-family:var(--font-display);font-size:22px;line-height:1">glorpies</span></div>
    <div style="font-size:15px;color:var(--color-ink-2)"><span style="color:var(--color-accent)">$</span> npm i glorpies</div>
  </div>
  <div style="${rule};margin:28px 0 0"></div>
  <div style="font-family:var(--font-display);font-size:68px;line-height:1.1;margin-top:58px;white-space:nowrap">${[...HEADLINE].map(cell).join('')}<span class="cursor"></span></div>
  <p style="margin:22px 0 0;font-size:19px;line-height:1.55;color:var(--color-ink-2);max-width:900px">9,007,199,254,740,992 hand-painted aliens, over a million for every person on earth. any string gets its own, and always the same one.</p>
  <div style="flex:1"></div>
  <div style="display:flex;align-items:flex-end;justify-content:space-between">
    ${CREW.map(([name, o]) => `<img src="${face(name, { size: 300, ...o })}" style="width:136px;height:136px" />`).join('')}
  </div>
</div>`;

/** One name in 24 looks, as a contact sheet with a transparent page behind it, so it sits on GitHub's page in either theme. */
const LOOKS = ['watercolour', 'gouache', 'oil', 'sumi', 'charcoal', 'pointillism', 'linocut', 'warhol', 'stained', 'mosaic', 'neon', 'holo', 'atkinson', 'plotter', 'thermal', 'topo', 'blob', 'ink', 'sticker', 'cutpaper', 'pixel-icon', 'line-icon', 'glow', 'wash'];
const looks = () => `
<div id="art" style="width:1280px;box-sizing:border-box;padding:24px 48px 28px;color:var(--color-ink);font-family:var(--font-mono)">
  <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:26px 18px">
    ${LOOKS.map((look) => `<figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:10px"><img src="${face('zorb-from-accounts', { size: 260, look, shape: 'squircle' })}" style="width:128px;height:128px" /><figcaption style="font-size:13px;color:var(--color-ink-2)">${look}</figcaption></figure>`).join('')}
  </div>
</div>`;

async function shoot(page, file, theme, html, options = {}) {
  // a running dev server can reload the page under us, after a file of its own was written; that's one more try
  for (let attempt = 1; ; attempt++) {
    try {
      return await shootOnce(page, file, theme, html, options);
    } catch (error) {
      if (attempt === 3) throw error;
      await page.goto(`${base}/how`);
    }
  }
}

async function shootOnce({ send, evaluate }, file, theme, html, { square = false, scale = 1, to = out }) {
  const box = await evaluate(`(async () => {
    document.documentElement.dataset.theme = ${JSON.stringify(theme)};
    document.body.innerHTML = ${JSON.stringify(html)};
    document.body.style.margin = '0';
    // held still, so the stars are caught the same way every time
    document.head.insertAdjacentHTML('beforeend', '<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>');
    // a transparent page: the banner's rounded corners and the contact sheet show whatever is behind them
    for (const el of [document.documentElement, document.body]) el.style.background = 'transparent';
    // the page's grain (and stars and glow, by night) are layers over the whole page; they're moved inside the banner, and left off the contact sheet
    const art = document.getElementById('art');
    if (art.dataset.grain) {
      art.style.position = 'relative';
      for (const pseudo of ['::before', '::after']) {
        const from = getComputedStyle(document.body, pseudo);
        if (from.content === 'none') continue;
        const layer = document.createElement('div');
        for (const p of ['backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'opacity', 'mixBlendMode']) layer.style[p] = from[p];
        Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
        art.append(layer);
      }
    }
    if (${JSON.stringify(square)}) art.style.borderRadius = '0';
    document.head.insertAdjacentHTML('beforeend', '<style>body::before,body::after{display:none!important}</style>');
    await Promise.all(['500 68px var(--font-pixel)', '400 19px var(--font-geist-mono)', '400 60px var(--font-tifinagh)', '400 60px var(--font-braille-dots)']
      .map((f) => document.fonts.load(f.replace(/var\\((--[^)]+)\\)/, (_, v) => getComputedStyle(document.documentElement).getPropertyValue(v)))));
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    await new Promise((r) => setTimeout(r, 300));
    const r = art.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
  if (!(await evaluate(`!!document.getElementById('art')`))) throw new Error('the page reloaded before the capture');
  const format = file.endsWith('.png') ? 'png' : 'webp';
  const shot = await send('Page.captureScreenshot', { format, quality: format === 'webp' ? 90 : undefined, clip: { ...box, scale } });
  writeArt(file, Buffer.from(shot.data, 'base64'), to);
  console.log('wrote', file);
}

await withChrome(async (page) => {
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1400, deviceScaleFactor: 2, mobile: false });
  await page.goto(`${base}/how`);
  for (const theme of ['dark', 'light']) {
    await shoot(page, `banner-${theme}.webp`, theme, banner());
    await shoot(page, `looks-${theme}.webp`, theme, looks());
  }
  // the site's link preview: the dark banner, square, at the 1280 × 640 previews are drawn at
  // (last: a new file in src/app makes a running dev server reload the page)
  await shoot(page, 'opengraph-image.png', 'dark', banner(), { square: true, scale: 0.5, to: new URL('../src/app/', import.meta.url) });
}, { width: 1400, height: 1400 });

// the states, alive: looping GIFs straight from the handler
for (const state of ['idle', 'thinking', 'working', 'waiting', 'blocked', 'done']) {
  const res = await fetch(face('agent-47', { state, format: 'gif', size: '160', shape: 'squircle' }));
  if (!res.ok) throw new Error(`${state}: ${res.status}`);
  writeArt(`state-${state}.gif`, Buffer.from(await res.arrayBuffer()));
  console.log('wrote', `state-${state}.gif`);
}
faces.close();
