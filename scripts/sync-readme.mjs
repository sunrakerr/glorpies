// README.md is the source; npm needs absolute links instead of repository-relative ones.
import { readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';

const root = new URL('../README.md', import.meta.url);
const target = new URL('../packages/glorpies/README.md', import.meta.url);
const repo = 'https://github.com/sunrakerr/glorpies';
const web = 'https://glorpies.sunrakerr.dev';
let content = readFileSync(root, 'utf8')
  .replaceAll('src="public/readme/', `src="${web}/readme/`)
  .replaceAll('srcset="public/readme/', `srcset="${web}/readme/`)
  .replaceAll('href="LICENSE"', `href="${repo}/blob/main/LICENSE"`)
  .replace(/(\[[^\]]*\]\()([^\s)]+)(\))/g, (match, open, path, close) => {
    if (/^(?:https?:|mailto:|#)/.test(path)) return match;
    return `${open}${repo}/blob/main/${path}${close}`;
  });
content = await format(`<!-- Generated from README.md by pnpm readme:sync. -->\n\n${content}`, {
  ...await resolveConfig(root.pathname), parser: 'markdown',
});
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== content) {
    console.error('The npm README is out of sync. Run pnpm readme:sync.');
    process.exitCode = 1;
  }
} else {
  writeFileSync(target, content);
  console.log('Synced packages/glorpies/README.md');
}
