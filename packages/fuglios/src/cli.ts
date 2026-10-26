import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { isLook, LOOKS } from './looks';
import { FORMATS, renderImage, type ImageFormat } from './server';
import { isState, STATES } from './states';
import { isShape, SHAPES } from './still';

const HELP = `fuglios: paint a face from any name

  npx -p fuglios -p @napi-rs/canvas fuglios [options] <name>

  -l, --look    ${'auto'}, or one of: ${LOOKS.map((l) => l.id).join(', ')}
  -s, --size    pixels (default 256)
  -f, --format  ${FORMATS.join(', ')} (default: from --out, else png)
      --shape   ${SHAPES.join(', ')} (default square)
      --state   ${STATES.join(', ')} (default idle)
      --loop    seconds, for gif (default 3)
  -o, --out     file to write (default <name>.<format>; "-" for stdout)
  -h, --help

  npx fuglios agent-47 --look ink --size 128 --shape circle -o agent.png
  npx fuglios agent-47 --state thinking -f gif`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      look: { type: 'string', short: 'l' },
      size: { type: 'string', short: 's' },
      format: { type: 'string', short: 'f' },
      shape: { type: 'string' },
      state: { type: 'string' },
      loop: { type: 'string' },
      out: { type: 'string', short: 'o' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const name = positionals.join(' ');
  if (values.help || !name) {
    console.log(HELP);
    process.exit(values.help ? 0 : 1);
  }
  const fail = (msg: string): never => {
    console.error(`fuglios: ${msg}`);
    process.exit(1);
  };
  const num = (flag: string, v: string | undefined, lo: number, hi: number) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : fail(`--${flag} must be a number from ${lo} to ${hi}`);
  };
  const fromOut = values.out?.split('.').pop()?.replace('jpg', 'jpeg');
  const format = (values.format ?? (FORMATS as readonly string[]).find((f) => f === fromOut) ?? 'png') as ImageFormat;
  if (!(FORMATS as readonly string[]).includes(format)) fail(`unknown format "${format}"`);
  if (values.look && values.look !== 'auto' && !isLook(values.look)) fail(`unknown look "${values.look}"`);
  if (values.shape && !isShape(values.shape)) fail(`unknown shape "${values.shape}"`);
  if (values.state && !isState(values.state)) fail(`unknown state "${values.state}"`);

  const { body } = await renderImage(name, {
    format,
    look: values.look as never,
    size: num('size', values.size, 16, 4096) ?? 256,
    shape: values.shape as never,
    state: values.state as never,
    loop: num('loop', values.loop, 0.5, 10),
  });
  const out = values.out ?? `${name.replace(/[^\w.-]+/g, '-')}.${format}`;
  if (out === '-') process.stdout.write(body);
  else {
    await writeFile(out, body);
    console.error(`painted ${out}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  if (e instanceof Error && e.message.includes('@napi-rs/canvas')) console.error('with npx: npx -p fuglios -p @napi-rs/canvas fuglios <name>');
  process.exit(1);
});
