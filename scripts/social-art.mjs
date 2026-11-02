// Static link-preview cards, using real Glorpies and the site's own typefaces.
// Build the library first, then: node scripts/social-art.mjs [site-url]
// The deployed site supplies CSS/fonts; faces are embedded as data URLs. No image server is needed.
import { writeFileSync } from 'node:fs';
import { renderImage } from '../packages/glorpies/dist/server.js';
import { withChrome } from './lib/chrome.mjs';

const base = process.argv[2] ?? 'https://glorpies.sunrakerr.dev';
const invader = `<svg viewBox="0 0 11 8" shape-rendering="crispEdges" style="width:30px;height:22px;fill:#2f7d24" aria-hidden="true">${['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'].flatMap((row, y) => [...row].map((on, x) => (on === '1' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('')}</svg>`;
const cards = [
  {
    route: '',
    label: 'all hail the glorpies',
    headline: 'all hail the<br>glorpies.',
    copy: 'hand-painted alien avatars from any string.<br>same name. same face. every time.',
    footer: 'open source · zero dependencies',
    faces: [['sunrakerrisfriednoodlz', 'watercolour']],
    alt: 'Glorpies: hand-painted alien avatars from any string. A purple crowned alien on a mint circle.',
  },
  {
    route: 'gallery',
    label: 'the gallery',
    headline: 'meet your<br>next avatar.',
    copy: 'any name gets its own little alien.<br>29 looks. find yours.',
    footer: 'try a name · pick a look · take it home',
    faces: [
      ['sunrakerrisfriednoodlz', 'watercolour'],
      ['ada@lovelace.dev', 'gouache'],
      ['soggy-glorp', 'oil'],
      ['grace@hopper.dev', 'sticker'],
    ],
    alt: 'The Glorpies gallery: meet your next avatar. Four hand-painted aliens in different looks.',
  },
  {
    route: 'docs',
    label: 'the docs',
    headline: 'a little alien.<br>in your app.',
    copy: 'react, vue, svelte, solid, preact & more.<br>one library. every framework.',
    footer: 'npm i glorpies',
    faces: [['sunrakerrisfriednoodlz', 'watercolour']],
    alt: 'Glorpies documentation: a little alien in your app. Framework components, server images and a CLI.',
  },
  {
    route: 'how',
    label: 'how it gets painted',
    headline: 'from a name<br>to a face.',
    copy: 'a seed, a few glazes, a little ink.<br>watch a glorpie come to life.',
    footer: 'deterministic faces · hand-painted character',
    faces: [
      ['sunrakerrisfriednoodlz', 'watercolour'],
      ['sunrakerrisfriednoodlz', 'linocut'],
      ['sunrakerrisfriednoodlz', 'gouache'],
      ['sunrakerrisfriednoodlz', 'oil'],
    ],
    alt: 'How a Glorpie gets painted: from a name to a face. The same crowned alien in four painting styles.',
  },
];

for (const card of cards) {
  card.images = await Promise.all(
    card.faces.map(async ([name, look]) => {
      const { body } = await renderImage(name, { size: 512, format: 'png', shape: 'circle', look });
      return `data:image/png;base64,${Buffer.from(body).toString('base64')}`;
    }),
  );
}

await withChrome(async ({ goto, send, evaluate }) => {
  await goto(`${base}/how`);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 640,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const card of cards) {
    const images = card.images
      .map((src) => `<img src="${src}" style="display:block;width:100%;height:100%" alt=""/>`)
      .join('');
    const html = `<main id="card" style="position:relative;box-sizing:border-box;width:1280px;height:640px;padding:48px 56px;background:#f4eee4;color:#2b231d;overflow:hidden;font-family:var(--font-geist-mono)">
      <header style="display:flex;align-items:center;justify-content:space-between;font-size:19px">
        <div style="display:flex;gap:16px;align-items:center"><span style="display:flex;gap:12px;align-items:center;font:28px var(--font-pixel);color:#2f7d24">${invader} glorpies</span><span style="color:#75685c">/ ${card.label}</span></div>
        <span style="color:#75685c;font-size:17px">glorpies.sunrakerr.dev</span>
      </header>
      <div style="position:absolute;top:105px;left:56px;right:56px;border-top:1px dashed #c2b6a5"></div>
      <section style="position:absolute;left:56px;top:154px;width:710px">
        <h1 style="margin:0;font-family:var(--font-pixel);font-size:80px;font-weight:400;letter-spacing:-2px;line-height:1.08">${card.headline}</h1>
        <p style="margin:28px 0 0;font-size:23px;line-height:1.65;color:#65584c">${card.copy}</p>
      </section>
      <div style="position:absolute;right:48px;top:148px;width:414px;height:414px;${card.images.length === 4 ? 'display:grid;grid-template-columns:1fr 1fr;gap:14px' : ''}">${images}</div>
      <footer style="position:absolute;bottom:44px;left:56px;font-size:18px;color:#2f7d24">${card.footer}</footer>
    </main>`;
    await evaluate(`(async () => {
      document.documentElement.dataset.theme = 'light';
      document.body.innerHTML = ${JSON.stringify(html)};
      document.head.insertAdjacentHTML('beforeend', '<style>body{margin:0}body::before,body::after{display:none!important}*{animation:none!important}</style>');
      const style = getComputedStyle(document.documentElement);
      await Promise.all([['--font-pixel', '80px'], ['--font-geist-mono', '23px']].map(([name,size]) => document.fonts.load(size+' '+style.getPropertyValue(name))));
      await Promise.all([...document.images].map(image => image.decode()));
      const card = document.getElementById('card');
      if (card.scrollWidth > 1280 || card.scrollHeight > 640) throw new Error('card overflow');
    })()`);
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1280, height: 640, scale: 1 },
    });
    const folder = new URL(`../src/app/${card.route ? card.route + '/' : ''}`, import.meta.url);
    writeFileSync(new URL('opengraph-image.png', folder), Buffer.from(data, 'base64'));
    writeFileSync(new URL('opengraph-image.alt.txt', folder), card.alt + '\n');
    console.log(`wrote /${card.route || ''} social card`);
  }
});
