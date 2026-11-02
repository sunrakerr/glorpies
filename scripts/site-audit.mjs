// Fetch every page and its linked local assets from a production deployment.
import assert from 'node:assert/strict';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const base = process.env.BASE_URL || 'https://glorpies.sunrakerr.dev';
const paths = [];
function walk(dir, route = '') {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) walk(join(dir, item.name), route + '/' + item.name);
    else if (/^page\.(tsx|mdx)$/.test(item.name)) paths.push(route || '/');
  }
}
walk('src/app');
const results = [],
  links = new Set(),
  assets = new Set(),
  socialImages = new Set(),
  socialTitles = new Set(),
  socialDescriptions = new Set();
const decode = (value) => value?.replace(/&amp;/g, '&');
function meta(html, name) {
  const tag = [...html.matchAll(/<meta\b[^>]*>/g)]
    .map(([tag]) => tag)
    .find((tag) => tag.includes(`property="${name}"`) || tag.includes(`name="${name}"`));
  return decode(tag?.match(/content="([^"]*)"/)?.[1]);
}
for (const path of paths) {
  const response = await fetch(new URL(path, base), {
    headers: { 'User-Agent': 'Twitterbot/1.0' },
  });
  const html = await response.text();
  assert.equal(response.status, 200, path);
  assert.match(html, /<h1[ >]/, path + ' has a heading');
  assert.match(html, /<title>[^<]+<\/title>/, path + ' has a title');
  assert.ok(!html.includes('glorpies.vercel.app'), path + ' has no old domain');
  const canonical = decode(html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1]);
  const url = new URL(path, 'https://glorpies.sunrakerr.dev').href.replace(/\/$/, '');
  assert.equal(canonical, url, path + ' canonical URL');
  assert.equal(meta(html, 'og:url'), url, path + ' social URL');
  const title = decode(html.match(/<title>([^<]+)/)?.[1]),
    description = meta(html, 'description');
  for (const prefix of ['og', 'twitter']) {
    assert.equal(meta(html, `${prefix}:title`), title, path + ' ' + prefix + ' title');
    assert.equal(
      meta(html, `${prefix}:description`),
      description,
      path + ' ' + prefix + ' description',
    );
  }
  assert.ok(description?.length > 40, path + ' useful description');
  assert.equal(meta(html, 'twitter:card'), 'summary_large_image', path + ' large card');
  assert.ok(!socialTitles.has(title), path + ' unique title');
  socialTitles.add(title);
  assert.ok(!socialDescriptions.has(description), path + ' unique description');
  socialDescriptions.add(description);
  const image = meta(html, 'og:image');
  assert.equal(meta(html, 'twitter:image'), image, path + ' matching card images');
  const section = path.startsWith('/docs') ? '/docs' : path === '/' ? '' : path;
  if (path.startsWith('/docs/'))
    assert.match(
      new URL(image).pathname,
      /^\/_next\/static\/(?:immutable\/)?media\/opengraph-image\.[\w.-]+\.png$/,
      path + ' versioned docs image',
    );
  else
    assert.equal(
      new URL(image).pathname,
      section + '/opengraph-image.png',
      path + ' section image',
    );
  assert.equal(meta(html, 'og:image:width'), '1280');
  assert.equal(meta(html, 'og:image:height'), '640');
  assert.ok(meta(html, 'og:image:alt')?.length > 30, path + ' image description');
  assert.equal(
    meta(html, 'twitter:image:alt'),
    meta(html, 'og:image:alt'),
    path + ' matching alt text',
  );
  socialImages.add(image);
  for (const [, url] of html.matchAll(/<a\b[^>]*href="([^"#]+)"/g))
    if (url.startsWith('/') && !url.startsWith('//'))
      links.add(url.replace(/&amp;/g, '&').split('#')[0]);
  for (const [, url] of html.matchAll(/<(?:script|img|link)\b[^>]*(?:src|href)="([^"#]+)"/g))
    if (url.startsWith('/') && !url.startsWith('//')) assets.add(url.replace(/&amp;/g, '&'));
  results.push({ path, status: response.status, title: html.match(/<title>([^<]+)/)?.[1] });
}
const cardHashes = new Set();
for (const image of socialImages) {
  // A local/preview build still advertises production canonical URLs; fetch the
  // corresponding asset from the deployment being audited.
  const source = new URL(image);
  const response = await fetch(new URL(source.pathname + source.search, base));
  assert.equal(response.status, 200, image);
  assert.match(response.headers.get('content-type'), /image\/png/);
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1280);
  assert.equal(png.readUInt32BE(20), 640);
  assert.ok(png.length < 1_000_000, image + ' under 1 MB');
  cardHashes.add(createHash('sha256').update(png).digest('hex'));
}
assert.equal(cardHashes.size, 4, 'four distinct section cards');
for (const path of new Set([
  ...links,
  ...assets,
  ...readdirSync('public/readme').map((name) => '/readme/' + name),
])) {
  const response = await fetch(new URL(path, base));
  await response.arrayBuffer();
  assert.equal(response.status, path === '/no-such-photo.jpg' ? 404 : 200, path);
}
assert.equal(
  (await fetch(new URL('/api/face?name=agent-47', base))).status,
  404,
  'the docs site does not host image rendering',
);
const home = await fetch(base).then((r) => r.text());
assert.match(home, /data-theme="light"/);
assert.ok(home.includes('https://glorpies.sunrakerr.dev/opengraph-image.png'));
mkdirSync('media/release', { recursive: true });
writeFileSync(
  'media/release/site-audit.json',
  JSON.stringify(
    {
      base,
      finishedAt: new Date().toISOString(),
      pages: results,
      links: links.size,
      assets: assets.size,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `${results.length} pages with unique social metadata, ${cardHashes.size} social cards, ${links.size} local links, ${assets.size} assets and README images passed at ${base}`,
);
